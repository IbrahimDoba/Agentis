import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

const PAGE_SIZE = 30

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const isOwner = agent.userId === session.user.id
  const isAdmin = session.user.role === "ADMIN"
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const offsetParam = req.nextUrl.searchParams.get("offset")
  const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10)) : 0
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? ""

  const agentFilter = {
    OR: [
      { agentId: id },
      ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
    ] as object[],
  }

  const phoneFilter = search
    ? { phoneNumber: { contains: search } }
    : { phoneNumber: { not: null as null } }

  const where = { ...agentFilter, ...phoneFilter }

  const [groups, totalGroups] = await Promise.all([
    db.conversationLog.groupBy({
      by: ["phoneNumber"],
      where,
      _count: { conversationId: true },
      _max: { startTime: true, createdAt: true },
      // createdAt is always set; startTime can be null — use createdAt for reliable ordering
      orderBy: { _max: { createdAt: "desc" } },
      skip: offset,
      take: PAGE_SIZE + 1,
    }),
    db.conversationLog.groupBy({
      by: ["phoneNumber"],
      where,
      _count: { conversationId: true },
    }),
  ])

  const hasMore = groups.length > PAGE_SIZE
  const page = hasMore ? groups.slice(0, PAGE_SIZE) : groups

  const contacts = page.map((g) => ({
    phoneNumber: g.phoneNumber as string,
    conversationCount: g._count.conversationId,
    // Prefer actual startTime for display accuracy, fall back to createdAt
    lastActive: g._max.startTime
      ? Math.floor(new Date(g._max.startTime).getTime() / 1000)
      : Math.floor(new Date(g._max.createdAt!).getTime() / 1000),
  }))

  return NextResponse.json({
    contacts,
    total: totalGroups.length,
    has_more: hasMore,
    next_offset: hasMore ? offset + PAGE_SIZE : null,
  })
}
