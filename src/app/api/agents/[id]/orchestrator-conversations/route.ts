import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import {
  getCustomerPhonesByName,
  isLikelyLid,
  resolveDisplayPhone,
} from "@/lib/queries/conversations"

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
      // Hide empty widget chats: a visitor who opened the embed widget but never
      // sent a message. Only surface an embed conversation once it has at least
      // one message. WhatsApp conversations are always created on a real inbound
      // message, so they're never hidden by this.
      where: {
        agentId,
        NOT: { channel: "embed", messages: { none: {} } },
      },
      orderBy: { lastActivityAt: "desc" },
      select: {
        id: true,
        phoneNumber: true,
        contactName: true,
        mode: true,
        aiLocked: true,
        channel: true,
        visitorId: true,
        lastActivityAt: true,
        createdAt: true,
        adContext: true,
        handoffReason: true,
        handoffAt: true,
        handoffUrgency: true,
        leadQualifiedAt: true,
        leadIntent: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, direction: true, createdAt: true },
        },
      },
    })

    // Only resolve LID conversations, and only fetch the customers whose names
    // could match them — instead of pulling up to 1000 customer rows per poll.
    const lidConversations = conversations.filter((c) => isLikelyLid(c.phoneNumber))
    const phonesByName = await getCustomerPhonesByName(
      db,
      agentId,
      lidConversations.map((c) => c.contactName)
    )

    const lidCandidates = lidConversations.map((c) => c.phoneNumber)

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

    // Attach synced WhatsApp labels to each conversation, matched by phone.
    const [chatLabels, labelDefs] = await Promise.all([
      db.chatLabel.findMany({ where: { agentId }, select: { phoneNumber: true, waLabelId: true } }),
      db.whatsAppLabel.findMany({
        where: { agentId, deleted: false },
        select: { waLabelId: true, name: true, color: true, isStage: true },
      }),
    ])
    const defById = new Map(labelDefs.map((l) => [l.waLabelId, l]))
    const labelsByPhone = new Map<string, typeof labelDefs>()
    for (const cl of chatLabels) {
      if (!cl.phoneNumber) continue
      const def = defById.get(cl.waLabelId)
      if (!def) continue
      const list = labelsByPhone.get(cl.phoneNumber) ?? []
      list.push(def)
      labelsByPhone.set(cl.phoneNumber, list)
    }

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        ...resolveDisplayPhone(c, phonesByName, workerResolvedMap),
        id: c.id,
        phoneNumber: c.phoneNumber,
        contactName: c.contactName,
        mode: c.mode,
        aiLocked: c.aiLocked,
        channel: c.channel,
        visitorId: c.visitorId,
        lastActivityAt: (c.lastActivityAt ?? c.createdAt).toISOString(),
        createdAt: c.createdAt.toISOString(),
        adContext: c.adContext,
        handoffReason: c.handoffReason,
        handoffAt: c.handoffAt ? c.handoffAt.toISOString() : null,
        handoffUrgency: c.handoffUrgency,
        leadQualifiedAt: c.leadQualifiedAt ? c.leadQualifiedAt.toISOString() : null,
        leadIntent: c.leadIntent,
        labels: labelsByPhone.get(c.phoneNumber) ?? [],
        messageCount: c._count.messages,
        lastMessage: c.messages[0]
          ? {
              content: c.messages[0].content,
              direction: c.messages[0].direction,
              senderRole: "ai",
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
