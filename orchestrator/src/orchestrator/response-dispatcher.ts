import { logger as rootLogger } from "../lib/logger.js"
import { config } from "../config.js"

const logger = rootLogger.child({ module: "dispatcher" })

export interface DispatchOptions {
  agentId: string
  conversationId: string
  toJid: string
  text: string
  source: "ai" | "human"
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
