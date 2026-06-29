import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { push } from "@/lib/sse-store"
import { isFreeTrialExpired } from "@/lib/trial"

// Quick-send: message a single WhatsApp number directly (no contact list).
// Unlike broadcasts this can reach brand-new numbers, so we verify the number
// is on WhatsApp first and route the send through the worker with source "api"
// — which bills credits AND enforces the agent's warmup / rate / new-contact
// caps, same as any non-human outbound.

// Default country code for local numbers entered with a leading 0 (Nigeria).
// Numbers already in international form keep their own country code.
const DEFAULT_COUNTRY_CODE = "234"

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  // "00" is the international access prefix — the real country code follows it.
  if (digits.startsWith("00")) return digits.slice(2)
  // A single leading "0" is a local number — swap it for the default code.
  if (digits.startsWith("0")) return DEFAULT_COUNTRY_CODE + digits.slice(1)
  return digits
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
      select: {
        userId: true,
        messagingEnabled: true,
        user: { select: { plan: true, resellerId: true, subscriptionExpiresAt: true } },
      },
    })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Free-trial wall: a platform free user whose trial has ended can't send.
    if (isFreeTrialExpired(agent.user)) {
      return NextResponse.json(
        { error: "Your free trial has ended — choose a plan to keep sending." },
        { status: 402 }
      )
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
