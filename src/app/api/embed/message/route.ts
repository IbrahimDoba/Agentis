import { NextRequest } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { resolveEmbedSite } from "@/lib/embed-auth"
import { corsJson, isAllowedOrigin, preflight } from "@/lib/embed-cors"

// Public send endpoint. The widget calls this for every visitor message.
// We persist the inbound row immediately so the dashboard sees it even if
// the orchestrator forward fails, then enqueue to the orchestrator the
// same way the WhatsApp worker does — same /v1/inbound endpoint with
// channel="embed" and a synthetic senderJid the orchestrator doesn't use.

const bodySchema = z.object({
  publicKey: z.string().min(8).max(128),
  visitorId: z.string().min(8).max(128),
  conversationId: z.string().min(8).max(64),
  text: z.string().min(1).max(4000),
})

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY || process.env.WORKER_API_KEY

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin")
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return corsJson({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400, origin, allowedOrigins: [] })
  }

  const { publicKey, visitorId, conversationId, text } = parsed.data

  const site = await resolveEmbedSite(publicKey)
  if (!site) {
    return corsJson({ error: "Widget not found or disabled" }, { status: 404, origin, allowedOrigins: [] })
  }
  if (!isAllowedOrigin(origin, site.allowedOrigins)) {
    return corsJson({ error: "Origin not allowed" }, { status: 403, origin, allowedOrigins: site.allowedOrigins })
  }

  // Verify the conversation belongs to this site AND this visitor. Prevents
  // a hostile site from posting messages into a stranger's conversation by
  // guessing IDs.
  const conv = await db.conversation.findFirst({
    where: {
      id: conversationId,
      agentId: site.agentId,
      channel: "embed",
      visitorId,
    },
    select: { id: true, mode: true },
  })
  if (!conv) {
    return corsJson({ error: "Conversation not found" }, { status: 404, origin, allowedOrigins: site.allowedOrigins })
  }

  // Persistence is owned by the orchestrator (single-writer for inbound
  // messages, same as the WhatsApp worker path). We just forward and let
  // it dedup + insert.
  const messageId = randomUUID()

  // Forward to orchestrator's /v1/inbound. We reuse the same endpoint the
  // WhatsApp worker hits — the orchestrator branches on `channel` to skip
  // the WhatsApp-only steps (anti-ban pacing, Baileys dispatch).
  if (!ORCHESTRATOR_API_KEY) {
    return corsJson({ error: "Server misconfigured" }, { status: 500, origin, allowedOrigins: site.allowedOrigins })
  }

  fetch(`${ORCHESTRATOR_URL}/v1/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`,
    },
    body: JSON.stringify({
      agentId: site.agentId,
      messageId,
      // For embed conversations the orchestrator stores visitorId as the
      // phoneNumber on the Conversation row — keeping the existing
      // (agentId, phoneNumber) unique constraint useful.
      fromPhone: visitorId,
      senderJid: `web:${visitorId}@embed`,
      text,
      timestamp: Date.now(),
      channel: "embed",
      visitorId,
    }),
  }).catch((err) => {
    // Fire-and-forget — visitor doesn't need to wait for the LLM round-trip
    // to get an ack on send. Log so we notice if the queue is broken.
    console.error("[embed] orchestrator forward failed", err)
  })

  return corsJson(
    { messageId, queued: true },
    { status: 202, origin, allowedOrigins: site.allowedOrigins }
  )
}
