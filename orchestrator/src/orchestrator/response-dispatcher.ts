import { logger as rootLogger } from "../lib/logger.js"
import { config } from "../config.js"

const logger = rootLogger.child({ module: "dispatcher" })

export interface DispatchOptions {
  agentId: string
  conversationId: string
  toJid: string
  text: string
  source: "ai" | "human"
  // Which transport to send over. "meta" goes to the frontend's Cloud API send
  // endpoint; everything else goes to the Baileys worker. Defaults to the
  // worker so existing callers are unaffected.
  channel?: string
  // The persisted Message row backing this part. The worker deletes it if it
  // aborts the send (a human replied while the job sat in the queue) so the
  // dashboard never shows an AI message that was never delivered.
  messageId?: string
  // PAYG: real OpenAI token counts for this LLM turn. Pass on the FIRST part
  // of a split reply; pass 0/0 on subsequent parts so they don't re-charge
  // the same turn. Worker falls back to flat per-type rate when omitted.
  tokensInput?: number
  tokensOutput?: number
  // Group only: the message that tagged us. The worker quotes it so the reply
  // is attributable — in a busy group an unquoted answer landing several
  // messages later reads as addressed to nobody.
  quotedMessageId?: string
  quotedParticipant?: string
  quotedText?: string
}

/**
 * Pre-generation credit gate. Asks the worker (the single source of billing
 * truth) whether the account can afford an AI reply, so we can skip the LLM call
 * for out-of-credits accounts instead of generating a reply that then gets
 * blocked at send. Fails OPEN: any error → true, so a billing/worker hiccup
 * never silently halts replies for paying customers.
 */
export async function canAffordReply(agentId: string): Promise<boolean> {
  try {
    const url = `${config.WA_WORKER_URL}/v1/billing/can-afford?agentId=${encodeURIComponent(agentId)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.WORKER_API_KEY}` } })
    if (!res.ok) return true // fail open — never block a reply on a check failure
    const body = (await res.json()) as { canAfford?: boolean }
    return body.canAfford !== false
  } catch (err) {
    logger.warn({ agentId, err: String(err) }, "canAffordReply check failed — allowing reply (fail-open)")
    return true
  }
}

/**
 * Send a Cloud API reply via the frontend, which holds the connected business's
 * token. Deliberately not called from here with Graph directly: those tokens are
 * encrypted with a key that lives in the frontend service, and copying that key
 * into a second service to save one hop is a bad trade.
 */
async function dispatchViaMeta(opts: DispatchOptions): Promise<void> {
  const url = `${config.APP_URL}/api/meta/internal/send`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.ORCHESTRATOR_API_KEY}`,
    },
    body: JSON.stringify({
      conversationId: opts.conversationId,
      to: opts.toJid,
      text: opts.text,
      ...(opts.messageId ? { messageId: opts.messageId } : {}),
      ...(opts.tokensInput !== undefined ? { tokensInput: opts.tokensInput } : {}),
      ...(opts.tokensOutput !== undefined ? { tokensOutput: opts.tokensOutput } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.error({ status: res.status, body, agentId: opts.agentId }, "Meta send failed")
    throw new Error(`Meta send failed: ${res.status}`)
  }

  logger.info(
    { agentId: opts.agentId, conversationId: opts.conversationId, preview: opts.text.slice(0, 60) },
    "Reply dispatched over Cloud API"
  )
}

/**
 * Dispatch a reply over the conversation's transport: the Cloud API for "meta",
 * otherwise the Baileys worker (which handles anti-ban pacing, typing
 * indicators, etc.).
 */
export async function dispatchReply(opts: DispatchOptions): Promise<void> {
  if (opts.channel === "meta") return dispatchViaMeta(opts)

  const url = `${config.WA_WORKER_URL}/v1/messages/send`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.WORKER_API_KEY}`,
    },
    body: JSON.stringify({
      agentId: opts.agentId,
      to: opts.toJid,
      text: opts.text,
      conversationId: opts.conversationId,
      source: opts.source,
      ...(opts.messageId ? { messageId: opts.messageId } : {}),
      ...(opts.tokensInput !== undefined ? { tokensInput: opts.tokensInput } : {}),
      ...(opts.tokensOutput !== undefined ? { tokensOutput: opts.tokensOutput } : {}),
      ...(opts.quotedMessageId ? { quotedMessageId: opts.quotedMessageId } : {}),
      ...(opts.quotedParticipant ? { quotedParticipant: opts.quotedParticipant } : {}),
      ...(opts.quotedText ? { quotedText: opts.quotedText } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.error({ status: res.status, body, agentId: opts.agentId }, "Failed to dispatch reply to worker")
    throw new Error(`Worker send failed: ${res.status}`)
  }

  logger.info({
    agentId: opts.agentId,
    toJid: opts.toJid,
    preview: opts.text.slice(0, 60),
  }, "Reply dispatched to worker")
}

export interface ChargeTurnOptions {
  agentId: string
  conversationId: string
  tokensInput: number
  tokensOutput: number
}

/**
 * Record credits for an AI turn that never touches the Baileys send queue —
 * the embed widget and the Cloud API ("meta") channel. The queue does the
 * per-message billing for Baileys sends, so without this those channels reply
 * for free. Best-effort: the reply is already delivered, so a billing hiccup
 * must not fail the turn.
 */
export async function chargeTurnOutsideWorker(opts: ChargeTurnOptions): Promise<void> {
  const res = await fetch(`${config.WA_WORKER_URL}/v1/billing/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.WORKER_API_KEY}`,
    },
    body: JSON.stringify({
      agentId: opts.agentId,
      conversationId: opts.conversationId,
      tokensInput: opts.tokensInput,
      tokensOutput: opts.tokensOutput,
      messageType: "text",
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Worker charge failed: ${res.status} ${body}`)
  }
}

export interface DispatchLabelOptions {
  agentId: string
  toJid: string
  waLabelId: string
  action: "add" | "remove"
  appliedBy?: "ai" | "operator"
}

/**
 * Apply or remove a WhatsApp label on a chat via the worker. Best-effort from
 * the caller's perspective — throws on a non-OK response so the tool can report
 * it, but a failure never blocks the AI's text reply.
 */
export async function dispatchLabel(opts: DispatchLabelOptions): Promise<void> {
  const path = opts.action === "add" ? "assign" : "remove"
  const res = await fetch(`${config.WA_WORKER_URL}/v1/labels/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.WORKER_API_KEY}`,
    },
    body: JSON.stringify({
      agentId: opts.agentId,
      to: opts.toJid,
      waLabelId: opts.waLabelId,
      ...(opts.action === "add" ? { appliedBy: opts.appliedBy ?? "ai" } : {}),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.error({ status: res.status, body, agentId: opts.agentId, action: opts.action }, "Failed to dispatch label to worker")
    throw new Error(`Worker label ${opts.action} failed: ${res.status}`)
  }
}

export interface DispatchMediaOptions {
  agentId: string
  conversationId: string
  toJid: string
  mediaUrl: string
  caption?: string
  // Media kind for the worker's WhatsApp send. Defaults to "image" for
  // backward compatibility (product-image sends). "document" also carries a
  // filename + mimetype the recipient sees.
  type?: "image" | "video" | "document"
  mimeType?: string
  fileName?: string
}

/**
 * Dispatch an image to the worker.
 */
export async function dispatchMedia(opts: DispatchMediaOptions): Promise<void> {
  const url = `${config.WA_WORKER_URL}/v1/messages/send`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.WORKER_API_KEY}`,
    },
    body: JSON.stringify({
      agentId: opts.agentId,
      to: opts.toJid,
      text: opts.caption || "",
      mediaUrl: opts.mediaUrl,
      type: opts.type ?? "image",
      mediaMimeType: opts.mimeType,
      mediaFileName: opts.fileName,
      conversationId: opts.conversationId,
      source: "ai",
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.error({ status: res.status, body, agentId: opts.agentId }, "Failed to dispatch media to worker")
    throw new Error(`Worker send media failed: ${res.status}`)
  }

  logger.info({
    agentId: opts.agentId,
    toJid: opts.toJid,
    hasCaption: !!opts.caption,
  }, "Media dispatched to worker")
}

export interface DispatchAlbumOptions {
  agentId: string
  toJid: string
  images: string[]
  captions?: string[] // per-image caption (product name), same order as images
  title?: string
}

/**
 * Dispatch a set of product images to the worker as a single grouped album.
 */
export async function dispatchAlbum(opts: DispatchAlbumOptions): Promise<{ sent: number }> {
  const url = `${config.WA_WORKER_URL}/v1/messages/album`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.WORKER_API_KEY}`,
    },
    body: JSON.stringify({
      agentId: opts.agentId,
      to: opts.toJid,
      images: opts.images,
      captions: opts.captions,
      title: opts.title || undefined,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.error({ status: res.status, body, agentId: opts.agentId }, "Failed to dispatch album to worker")
    throw new Error(`Worker album send failed: ${res.status}`)
  }

  const json = (await res.json().catch(() => ({}))) as { sent?: number }
  logger.info({ agentId: opts.agentId, toJid: opts.toJid, sent: json.sent }, "Album dispatched to worker")
  return { sent: json.sent ?? opts.images.length }
}
