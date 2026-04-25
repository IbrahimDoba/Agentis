import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { push } from "@/lib/sse-store"

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

    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        direction: true,
        content: true,
        mediaUrl: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        senderRole: "ai",
        content: m.content,
        mediaUrl: m.mediaUrl,
        createdAt: m.createdAt.toISOString(),
      })),
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
          },
        },
      },
    })
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (conversation.mode !== "human") {
      return NextResponse.json({ error: "Switch this conversation to human handoff before sending" }, { status: 409 })
    }

    // Save to DB
    await db.message.create({
      data: {
        conversationId,
        direction: "outbound",
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

    await db.conversation.update({
      where: { id: conversationId },
      data: { lastActivityAt: new Date() },
    })

    push(conversation.agentId, "message", { agentId: conversation.agentId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST conversation message]", err)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
