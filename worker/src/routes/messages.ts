import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { outboundQueue } from "../queue/outbound-queue.js"
import { sessionManager } from "../baileys/session-manager.js"
import { sendAlbum } from "../anti-ban/pacing.js"
import { chargeAiCredits } from "../billing/charge.js"
import { creditsForMessageType } from "../billing/credits.js"
import { RateLimitError } from "../lib/errors.js"

const sendSchema = z.object({
  agentId: z.string(),
  to: z.string(), // E.164 digits or JID
  text: z.string().default(""),
  mediaUrl: z.string().url().optional(),
  type: z.enum(["text", "image", "video", "document"]).default("text"),
  // Documents need a filename (what the recipient sees) + mimetype; videos may
  // carry a mimetype too. Optional for text/image.
  mediaMimeType: z.string().optional(),
  mediaFileName: z.string().optional(),
  conversationId: z.string().optional(),
  source: z.enum(["ai", "human", "api"]).default("ai"),
  // The orchestrator-persisted Message row backing this send. If the queue
  // aborts the send (a human replied first), the worker deletes this row so
  // the dashboard doesn't show a message the customer never received.
  messageId: z.string().optional(),
  // PAYG: orchestrator passes real OpenAI token counts so the worker bills
  // by actual cost instead of the flat per-type rate. Only the FIRST part of
  // a split reply carries non-zero tokens — subsequent parts pass 0/0 to
  // avoid double-charging the same LLM turn.
  tokensInput: z.number().int().min(0).optional(),
  tokensOutput: z.number().int().min(0).optional(),
})

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.post("/messages/send", async (req, reply) => {
    const body = sendSchema.parse(req.body)

    const toJid = body.to.includes("@") ? body.to : `${body.to}@s.whatsapp.net`

    const job = await outboundQueue.enqueue({
      agentId: body.agentId,
      toJid,
      text: body.text,
      mediaUrl: body.mediaUrl,
      type: body.type,
      mediaMimeType: body.mediaMimeType,
      mediaFileName: body.mediaFileName,
      conversationId: body.conversationId,
      source: body.source,
      messageId: body.messageId,
      tokensInput: body.tokensInput,
      tokensOutput: body.tokensOutput,
    })

    if (!job) throw new RateLimitError("Daily or hourly cap reached")

    reply.code(202).send({ jobId: job.id, status: "queued" })
  })

  // Verify a phone number is reachable on WhatsApp via the agent's live socket.
  const checkSchema = z.object({ agentId: z.string(), phone: z.string().min(5) })
  app.post("/contacts/check", async (req, reply) => {
    const { agentId, phone } = checkSchema.parse(req.body)
    const sock = sessionManager.get(agentId)
    if (!sock) return reply.code(409).send({ error: "WhatsApp session is not connected" })

    const digits = phone.replace(/\D/g, "")
    if (!digits) return reply.code(400).send({ error: "Invalid phone number" })

    try {
      const checks = (await sock.onWhatsApp(`${digits}@s.whatsapp.net`)) ?? []
      const match = checks.find((c) => c?.exists)
      return reply.code(200).send({ exists: !!match?.exists, jid: match?.jid ?? null })
    } catch {
      return reply.code(200).send({ exists: false, jid: null })
    }
  })

  // Send a set of product images as one grouped WhatsApp album. (Step 1 of the
  // product-album feature — the send primitive; billing/AI-trigger come later.)
  const albumSchema = z.object({
    agentId: z.string(),
    to: z.string(),
    images: z.array(z.string().url()).min(1).max(30),
    captions: z.array(z.string()).max(30).optional(), // per-image caption (e.g. product name), same order as images
    title: z.string().max(700).optional(),   // optional intro text before the album
    caption: z.string().max(700).optional(),  // optional caption on the first image
  })
  app.post("/messages/album", async (req, reply) => {
    const body = albumSchema.parse(req.body)
    const sock = sessionManager.get(body.agentId)
    if (!sock) return reply.code(409).send({ error: "WhatsApp session is not connected" })

    // Bill up-front — each image at the image rate — so a broke account can't
    // send for free. Refuse the send if it can't be charged.
    const credits = body.images.length * creditsForMessageType("image")
    try {
      await chargeAiCredits({ agentId: body.agentId, credits, messageType: "image" })
    } catch (err) {
      return reply.code(402).send({ error: err instanceof Error ? err.message : "Billing failed" })
    }

    const toJid = body.to.includes("@") ? body.to : `${body.to}@s.whatsapp.net`
    try {
      const result = await sendAlbum(sock, toJid, body.images, { title: body.title, caption: body.caption, captions: body.captions })
      return reply.code(200).send({ status: "sent", credits, ...result })
    } catch (err) {
      req.log.error({ err }, "Album send failed")
      return reply.code(500).send({ error: "Album send failed" })
    }
  })
}
