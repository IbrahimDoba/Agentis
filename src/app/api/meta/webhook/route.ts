import { NextRequest, NextResponse } from "next/server"
import {
  verifyWebhookChallenge,
  verifyWebhookSignature,
  sendText,
} from "@/lib/meta/cloud-api"
import { alreadySeen, appendMessage, getHistory, resolveTestPersona } from "@/lib/meta/store"
import { generateAgentReply } from "@/lib/meta/reply"

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
  value: unknown
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
      const messages = (value?.messages as unknown[]) ?? []
      for (const msg of messages) {
        const m = msg as { type?: string; from?: string; id?: string; text?: { body?: string } }
        if (m.type !== "text" || !m.from || !m.id || !m.text?.body) continue
        out.push({ from: m.from, text: m.text.body, wamid: m.id, value })
      }
    }
  }
  return out
}

async function handleInbound(msg: InboundText): Promise<void> {
  // Dedup on Meta's message id — a retried/redelivered webhook must not trigger
  // a second reply.
  if (await alreadySeen(msg.wamid)) return

  await appendMessage({
    waId: msg.from,
    direction: "inbound",
    text: msg.text,
    waMessageId: msg.wamid,
    raw: msg.value,
  })

  const persona = await resolveTestPersona()
  if (!persona) {
    console.error("[meta/webhook] No agent found to answer as — create an agent first")
    return
  }

  const history = await getHistory(msg.from)
  const reply = await generateAgentReply(persona, history, msg.text)
  const sent = await sendText(msg.from, reply)

  await appendMessage({
    waId: msg.from,
    direction: "outbound",
    text: reply,
    waMessageId: sent.waMessageId,
    raw: sent.raw,
  })
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
  try {
    messages = extractTextMessages(JSON.parse(rawBody))
  } catch {
    // Malformed JSON — ack anyway so Meta doesn't retry a body we can't parse.
    return NextResponse.json({ status: "ignored" })
  }

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
