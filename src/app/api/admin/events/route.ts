import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Admin view of the worker event log (connection failures, send failures, etc.).
// Super-admin only.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")?.trim() || undefined
  const limit = Math.min(300, Math.max(1, Number(searchParams.get("limit") ?? 150)))

  const [events, grouped] = await Promise.all([
    db.workerEvent.findMany({
      where: category ? { category } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.workerEvent.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ])

  // Resolve which agent (and its owner) each event belongs to, so the admin can
  // see the affected agent's name + who owns it instead of a raw id.
  const agentIds = [...new Set(events.map((e) => e.agentId).filter((x): x is string => !!x))]
  const agents = agentIds.length
    ? await db.agent.findMany({
        where: { id: { in: agentIds } },
        select: {
          id: true,
          businessName: true,
          user: { select: { name: true, businessName: true, email: true } },
        },
      })
    : []
  const agentMap = new Map(agents.map((a) => [a.id, a]))

  return NextResponse.json({
    events: events.map((e) => {
      const a = e.agentId ? agentMap.get(e.agentId) : undefined
      return {
        id: e.id,
        level: e.level,
        category: e.category,
        agentId: e.agentId,
        agentName: a?.businessName ?? null,
        ownerName: a?.user?.name ?? null,
        ownerBusiness: a?.user?.businessName ?? null,
        ownerEmail: a?.user?.email ?? null,
        message: e.message,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      }
    }),
    categories: grouped
      .map((g) => ({ category: g.category, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
  })
}
