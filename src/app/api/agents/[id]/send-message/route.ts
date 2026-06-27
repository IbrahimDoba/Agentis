import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { push } from "@/lib/sse-store"

// Quick-send: message a single WhatsApp number directly (no contact list).
// Unlike broadcasts this can reach brand-new numbers, so we verify the number
// is on WhatsApp first and route the send through the worker with source "api"
// — which bills credits AND enforces the agent's warmup / rate / new-contact
// caps, same as any non-human outbound.

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "")
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id: agentId } = await params
    const body = await req.json().catch(() => ({}))
    const phone = normalizePhone(typeof body.phone === "string" ? body.phone : "")
    const message = typeof body.message === "string" ? body.message.trim() : ""

    if (phone.length < 7) {
      return NextResponse.json({ error: "Enter a valid WhatsApp number, including country code" }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: "Message must be 1000 characters or fewer" }, { status: 400 })
    }

    // Access check: agent must belong to the user (or caller is admin)
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { userId: true, messagingEnabled: true },
    })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // WhatsApp must be live for this agent
    const waSession = await db.baileysSession.findUnique({
      where: { agentId },
      select: { status: true },
    })
    if (waSession?.status !== "CONNECTED") {
      return NextResponse.json({ error: "WhatsApp isn't connected for this agent" }, { status: 400 })
    }

    // Credit / subscription gate (the worker also enforces this authoritatively)
    if (!agent.messagingEnabled) {
      return NextResponse.json(
        { error: "Messaging is paused for this agent — check your credits or subscription" },
        { status: 402 }
      )
    }

    // Verify the number is actually on WhatsApp — sending to dead numbers is a
    // strong ban signal, so we never send unverified.
    let check: { exists: boolean; jid: string | null }
    try {
      check = await baileysClient.checkContact(agentId, phone)
    } catch {
      return NextResponse.json({ error: "Couldn't verify that number right now — please try again" }, { status: 502 })
    }
    if (!check.exists) {
      return NextResponse.json({ error: "That number isn't on WhatsApp" }, { status: 422 })
    }

    // Find-or-create the conversation so the send appears in the inbox and any
    // reply threads normally. Operator-initiated, so it opens in human mode —
    // toggle the AI on from the inbox if you want the agent to handle replies.
    const conversation = await db.conversation.upsert({
      where: { agentId_phoneNumber: { agentId, phoneNumber: phone } },
      create: { agentId, phoneNumber: phone, mode: "human", lastActivityAt: new Date() },
      update: { lastActivityAt: new Date() },
      select: { id: true },
    })

    // Record the outgoing message in the thread
    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        senderRole: "human",
        content: message,
      },
    })

    // Hand off to the worker (pacing, billing, rate limits, logging)
    await baileysClient.sendMessage({
      agentId,
      to: phone,
      text: message,
      conversationId: conversation.id,
      source: "api",
    })

    push(agentId, "message", { agentId })
    return NextResponse.json({ ok: true, conversationId: conversation.id })
  } catch (err) {
    console.error("[POST /api/agents/:id/send-message]", err)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
