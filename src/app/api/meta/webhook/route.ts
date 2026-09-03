import { NextRequest, NextResponse } from "next/server"
import { verifyWebhookChallenge, verifyWebhookSignature } from "@/lib/meta/cloud-api"
import { resolveNumberContext } from "@/lib/meta/routing"

// crypto + Prisma + openai — Node runtime, never cached.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — Meta's subscription verification handshake. Echo hub.challenge back in
// plain text on a verify-token match, else 403.
export async function GET(req: NextRequest) {
  try {
    const challenge = verifyWebhookChallenge(req.nextUrl.searchParams)
    if (challenge === null) {
      return new NextResponse("Verification failed", { status: 403 })
    }
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verify error"
    console.error("[meta/webhook] GET verify failed:", message)
    return new NextResponse(message, { status: 500 })
  }
}

interface InboundText {
  from: string
  text: string
  wamid: string
  /** Which of our numbers received this — the routing key for multi-tenant. */
  phoneNumberId: string
  value: unknown
}

// account_update fires whenever a business customer completes Embedded Signup,
// and carries the WABA they shared. It is the SERVER-SIDE record of an
// onboarding — the browser postMessage is the only other signal, and it is lost
// if the popup is closed, the tab crashes, or the domain isn't allow-listed.
// Logged rather than stored: a webhook carries no access token, and a
// connection without one can't do anything. It tells us a signup happened and
// which WABA it was, which is exactly what's needed to chase a failed exchange.
function logAccountUpdates(payload: unknown): number {
  let seen = 0
  const entries = (payload as { entry?: unknown[] })?.entry ?? []
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? []
    for (const change of changes) {
      const c = change as { field?: string; value?: Record<string, unknown> }
      if (c.field !== "account_update") continue
      seen++
      const v = c.value ?? {}
      const waba = (v.waba_info as Record<string, unknown> | undefined) ?? {}
      console.log(
        `[meta/webhook] account_update event=${v.event} waba=${waba.waba_id ?? "?"} ` +
          `owner_business=${waba.owner_business_id ?? "?"} phone=${v.phone_number ?? "?"}`
      )
    }
  }
  return seen
}

// Template review outcomes. Meta reviews asynchronously — often hours — so this
// is how an operator learns a template went APPROVED or REJECTED without
// sitting on the templates page refreshing. Logged rather than stored: we read
// templates live from Graph, so there is no local copy to update yet.
function logTemplateStatusUpdates(payload: unknown): number {
  let seen = 0
  const entries = (payload as { entry?: unknown[] })?.entry ?? []
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? []
    for (const change of changes) {
      const c = change as { field?: string; value?: Record<string, unknown> }
      if (c.field !== "message_template_status_update") continue
      seen++
      const v = c.value ?? {}
      console.log(
        `[meta/webhook] template ${v.message_template_name ?? "?"} ` +
          `(${v.message_template_language ?? "?"}) -> ${v.event ?? "?"}` +
          (v.reason && v.reason !== "NONE" ? ` reason=${v.reason}` : "")
      )
    }
  }
  return seen
}

// Pull the text messages out of a webhook payload. Status callbacks (sent /
// delivered / read) and non-text message types are intentionally skipped.
function extractTextMessages(payload: unknown): InboundText[] {
  const out: InboundText[] = []
  const entries = (payload as { entry?: unknown[] })?.entry ?? []
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? []
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value
      const metadata = value?.metadata as { phone_number_id?: string } | undefined
      const phoneNumberId = metadata?.phone_number_id
      const messages = (value?.messages as unknown[]) ?? []
      for (const msg of messages) {
        const m = msg as { type?: string; from?: string; id?: string; text?: { body?: string } }
        if (m.type !== "text" || !m.from || !m.id || !m.text?.body || !phoneNumberId) continue
        out.push({ from: m.from, text: m.text.body, wamid: m.id, phoneNumberId, value })
      }
    }
  }
  return out
}

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY || process.env.WORKER_API_KEY

async function handleInbound(msg: InboundText): Promise<void> {
  // Which number was this sent to? That decides which agent answers and whose
  // credentials the reply goes out with. An unknown number is never answered.
  const context = await resolveNumberContext(msg.phoneNumberId)
  if (!context) {
    console.error(
      `[meta/webhook] no agent for phone_number_id ${msg.phoneNumberId} — ` +
        `not a connected number, or its connection has no agent assigned`
    )
    return
  }

  if (!ORCHESTRATOR_API_KEY) {
    console.error("[meta/webhook] ORCHESTRATOR_API_KEY not set — cannot forward inbound")
    return
  }

  // Hand off to the orchestrator, exactly as the Baileys worker and the embed
  // widget do. It owns persistence, dedup, the AI turn, tagging, lead detection
  // and credit charging, and dispatches the reply back to
  // /api/meta/internal/send, which holds this business's Cloud API token.
  const res = await fetch(`${ORCHESTRATOR_URL}/v1/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`,
    },
    body: JSON.stringify({
      agentId: context.agentId,
      messageId: msg.wamid,
      fromPhone: msg.from,
      // No JID on the Cloud API. dispatchReply uses this as the send target,
      // and the Meta send path wants digits, so pass the wa_id through.
      senderJid: msg.from,
      text: msg.text,
      timestamp: Date.now(),
      channel: "meta",
      metaPhoneNumberId: msg.phoneNumberId,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`[meta/webhook] orchestrator forward failed (${res.status}): ${body}`)
  }
}

// POST — inbound messages. Verify Meta's signature over the RAW body, then
// answer each text message with the AI and reply via the Cloud API.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  try {
    if (!verifyWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
      return new NextResponse("Invalid signature", { status: 401 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature error"
    console.error("[meta/webhook] signature check failed:", message)
    return new NextResponse(message, { status: 500 })
  }

  let messages: InboundText[]
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
    messages = extractTextMessages(parsed)
  } catch {
    // Malformed JSON — ack anyway so Meta doesn't retry a body we can't parse.
    return NextResponse.json({ status: "ignored" })
  }

  logAccountUpdates(parsed)
  logTemplateStatusUpdates(parsed)

  // Process sequentially, then ack. gpt-4o-mini replies fast enough to stay
  // within Meta's window; each message is isolated so one failure can't sink
  // the batch. We always return 200 so a transient AI/send error doesn't
  // trigger Meta's retry storm — failures are logged for the event log instead.
  for (const msg of messages) {
    try {
      await handleInbound(msg)
    } catch (err) {
      console.error("[meta/webhook] failed to handle message:", err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ status: "ok", processed: messages.length })
}
