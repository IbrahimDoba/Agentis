import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function isLikelyLid(raw: string): boolean {
  const digits = raw.replace(/@.*$/, "").replace(/\D/g, "")
  return digits.length > 13
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: agentId } = await params

    // Verify ownership
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { userId: true, agentRuntime: true },
    })
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const conversations = await db.conversation.findMany({
      where: { agentId },
      orderBy: { lastActivityAt: "desc" },
      select: {
        id: true,
        phoneNumber: true,
        contactName: true,
        mode: true,
        lastActivityAt: true,
        createdAt: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, direction: true, senderRole: true, createdAt: true },
        },
      },
    })

    const customers = await db.customer.findMany({
      where: { agentId },
      select: {
        phoneNumber: true,
        name: true,
      },
      take: 1000,
    })

    const phonesByName = new Map<string, Set<string>>()
    for (const customer of customers) {
      const key = normalizeName(customer.name)
      if (!key) continue
      const current = phonesByName.get(key) ?? new Set<string>()
      current.add(customer.phoneNumber)
      phonesByName.set(key, current)
    }

    const lidCandidates = conversations
      .map((c) => c.phoneNumber)
      .filter((phone) => isLikelyLid(phone))

    const workerResolvedMap = new Map<string, string>()
    if (lidCandidates.length > 0) {
      try {
        const resolved = await baileysClient.resolvePhones(agentId, lidCandidates)
        for (const item of resolved.resolved) {
          if (item.phoneNumber && item.phoneNumber !== item.id) {
            workerResolvedMap.set(item.id, item.phoneNumber)
          }
        }
      } catch {
        // Worker resolver is best-effort; fallback logic below still applies.
      }
    }

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        ...(() => {
          const resolvedFromWorker = workerResolvedMap.get(c.phoneNumber) ?? null
          const nameKey = normalizeName(c.contactName)
          const candidates = nameKey ? phonesByName.get(nameKey) : undefined
          const resolvedFromName =
            isLikelyLid(c.phoneNumber) && candidates && candidates.size === 1
              ? Array.from(candidates)[0]
              : null

          return {
            displayPhoneNumber: resolvedFromWorker ?? resolvedFromName ?? c.phoneNumber,
            phoneSource: resolvedFromWorker
              ? "worker_lid_mapping"
              : resolvedFromName
                ? "customer_name_match"
                : "conversation",
          }
        })(),
        id: c.id,
        phoneNumber: c.phoneNumber,
        contactName: c.contactName,
        mode: c.mode,
        lastActivityAt: (c.lastActivityAt ?? c.createdAt).toISOString(),
        createdAt: c.createdAt.toISOString(),
        messageCount: c._count.messages,
        lastMessage: c.messages[0]
          ? {
              content: c.messages[0].content,
              direction: c.messages[0].direction,
              senderRole: c.messages[0].senderRole,
              createdAt: c.messages[0].createdAt.toISOString(),
            }
          : null,
      })),
    })
  } catch (err) {
    console.error("[GET orchestrator-conversations]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
