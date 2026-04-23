import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "")
}

type MergedContact = {
  phoneNumber: string
  displayName: string | null
  lastActiveAt: number
  sources: Set<string>
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const agent = await db.agent.findUnique({
      where: { id },
      select: { userId: true, elevenlabsAgentId: true },
    })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const waSession = await db.baileysSession.findUnique({
      where: { agentId: id },
      select: { agentId: true },
    })
    if (!waSession) {
      return NextResponse.json({ error: "No WhatsApp Web session found for this agent" }, { status: 400 })
    }

    const search = req.nextUrl.searchParams.get("search")?.trim() ?? ""
    const searchDigits = normalizePhone(search)

    const [conversations, customers, conversationLogs] = await Promise.all([
      db.conversation.findMany({
        where: {
          agentId: id,
          ...(search
            ? {
                OR: [
                  { phoneNumber: { contains: searchDigits || search } },
                  { contactName: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          phoneNumber: true,
          contactName: true,
          lastActivityAt: true,
          createdAt: true,
        },
        orderBy: { lastActivityAt: "desc" },
        take: 150,
      }),
      db.customer.findMany({
        where: {
          agentId: id,
          ...(search
            ? {
                OR: [
                  { phoneNumber: { contains: searchDigits || search } },
                  { name: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          phoneNumber: true,
          name: true,
          lastSeen: true,
        },
        orderBy: { lastSeen: "desc" },
        take: 150,
      }),
      db.conversationLog.findMany({
        where: {
          OR: [
            { agentId: id },
            ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
          ],
          phoneNumber: searchDigits || search
            ? { contains: searchDigits || search }
            : { not: null },
        },
        select: {
          phoneNumber: true,
          startTime: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
    ])

    const merged = new Map<string, MergedContact>()

    const upsert = (rawPhone: string | null, displayName: string | null, lastActiveAt: Date, source: string) => {
      if (!rawPhone) return
      const phoneNumber = normalizePhone(rawPhone)
      if (phoneNumber.length < 7) return

      const existing = merged.get(phoneNumber)
      if (!existing) {
        merged.set(phoneNumber, {
          phoneNumber,
          displayName: displayName?.trim() || null,
          lastActiveAt: lastActiveAt.getTime(),
          sources: new Set([source]),
        })
        return
      }

      existing.sources.add(source)
      if (lastActiveAt.getTime() >= existing.lastActiveAt) {
        existing.lastActiveAt = lastActiveAt.getTime()
      }
      if (!existing.displayName && displayName?.trim()) {
        existing.displayName = displayName.trim()
      }
    }

    for (const item of conversations) {
      upsert(item.phoneNumber, item.contactName, item.lastActivityAt ?? item.createdAt, "conversation")
    }

    for (const item of customers) {
      upsert(item.phoneNumber, item.name, item.lastSeen, "customer")
    }

    for (const item of conversationLogs) {
      upsert(item.phoneNumber, null, item.startTime ?? item.createdAt, "history")
    }

    const contacts = Array.from(merged.values())
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, 200)
      .map((item) => ({
        phoneNumber: item.phoneNumber,
        displayName: item.displayName,
        lastActiveAt: new Date(item.lastActiveAt).toISOString(),
        sources: Array.from(item.sources),
      }))

    return NextResponse.json({
      contacts,
      total: contacts.length,
    })
  } catch (error) {
    console.error("[GET /api/agents/:id/broadcast-contacts]", error)
    return NextResponse.json({ error: "Failed to load broadcast contacts" }, { status: 500 })
  }
}
