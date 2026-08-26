import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { push } from "@/lib/sse-store"
import { getConversationMessages } from "@/lib/queries/messages"
import { isFreeTrialExpired } from "@/lib/trial"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: conversationId } = await params

    // Verify ownership via conversation → agent → user
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { agent: { select: { userId: true } } },
    })
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const url = req.nextUrl
    const limitParam = url.searchParams.get("limit")
    const before = url.searchParams.get("before") ?? undefined
    const page = await getConversationMessages(db, conversationId, {
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
      before,
    })

    return NextResponse.json({
      messages: page.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        senderRole: "ai",
        content: m.content,
        mediaUrl: m.mediaUrl,
        senderName: m.senderName,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    })
  } catch (err) {
    console.error("[GET conversation messages]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: conversationId } = await params
    const { text } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 })

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: {
        agentId: true,
        phoneNumber: true,
        mode: true,
        agent: {
          select: {
            userId: true,
            agentRuntime: true,
            autoPauseOnHumanReply: true,
            user: { select: { plan: true, resellerId: true, subscriptionExpiresAt: true, creditBalance: true, creditsExpireAt: true } },
          },
        },
      },
    })
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Free-trial wall: a platform free user whose trial has ended can't send
    // (matches the quick-send + broadcast routes). Paid/reseller users are never gated.
    if (isFreeTrialExpired(conversation.agent.user)) {
      return NextResponse.json(
        { error: "Your free trial has ended — choose a plan to keep sending." },
        { status: 402 }
      )
    }

    // Save to DB
    await db.message.create({
      data: {
        conversationId,
        direction: "outbound",
        senderRole: "human",
        content: text.trim(),
      },
    })

    // Send via worker
    await baileysClient.sendMessage({
      agentId: conversation.agentId,
      to: conversation.phoneNumber,
      text: text.trim(),
      conversationId,
      source: "human",
    })

    // Auto-pause AI: when the agent's autoPauseOnHumanReply setting is on
    // (default true), any human-sent message flips an AI conversation into
    // human-handoff mode. The orchestrator's handle-inbound checks the mode
    // on the next customer message and skips the AI reply. User clicks the
    // AI toggle when they want the agent back. If the setting is off, the
    // operator's send goes through but the AI keeps replying to subsequent
    // customer messages — useful for power users who manage handoff manually.
    const shouldAutoPause =
      conversation.mode === "ai" && conversation.agent.autoPauseOnHumanReply
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        lastActivityAt: new Date(),
        ...(shouldAutoPause && { mode: "human" }),
      },
    })

    push(conversation.agentId, "message", { agentId: conversation.agentId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST conversation message]", err)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
