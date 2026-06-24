import { logger as rootLogger } from "../lib/logger.js"
import { config } from "../config.js"

const logger = rootLogger.child({ module: "dispatcher" })

export interface DispatchOptions {
  agentId: string
  conversationId: string
  toJid: string
  text: string
  source: "ai" | "human"
  // PAYG: real OpenAI token counts for this LLM turn. Pass on the FIRST part
  // of a split reply; pass 0/0 on subsequent parts so they don't re-charge
  // the same turn. Worker falls back to flat per-type rate when omitted.
  tokensInput?: number
  tokensOutput?: number
}

/**
 * Dispatch a reply through the Baileys worker's send endpoint.
 * The worker handles anti-ban pacing, typing indicators, etc.
 */
export async function dispatchReply(opts: DispatchOptions): Promise<void> {
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
      ...(opts.tokensInput !== undefined ? { tokensInput: opts.tokensInput } : {}),
      ...(opts.tokensOutput !== undefined ? { tokensOutput: opts.tokensOutput } : {}),
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
      type: "image",
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
