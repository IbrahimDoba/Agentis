import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { isDuplicate, isDuplicateContent } from "../orchestrator/dedup.js"
import { inboundQueue } from "../queue/queues.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "route:inbound" })

const adContextSchema = z.object({
  title: z.string().nullable(),
  body: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceId: z.string().nullable(),
  ctwaClid: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  capturedAt: z.string(),
})

const inboundSchema = z.object({
  agentId: z.string().min(1),
  messageId: z.string().min(1),
  fromPhone: z.string().min(1),
  senderJid: z.string().min(1),
  text: z.string().min(1),
  timestamp: z.number(),
  pushName: z.string().optional(),
  transportType: z.string().optional(),
  adContext: adContextSchema.optional(),
  // Embed-widget specific. When channel === "embed" the orchestrator skips
  // the WhatsApp-only dispatch path and just persists the outbound reply —
  // the visitor's browser picks it up via polling on /api/embed/messages.
  channel: z.enum(["whatsapp", "embed"]).optional(),
  visitorId: z.string().min(1).optional(),
  // Inbound image (data URL or https) for vision. Capped to keep the queue
  // payload sane; the worker only forwards reasonably-sized images.
  imageDataUrl: z.string().max(15_000_000).optional(),
})

export async function inboundRoutes(app: FastifyInstance) {
  app.post("/inbound", async (req, reply) => {
    const parsed = inboundSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() })
    }

    const { agentId, messageId, fromPhone, senderJid, text, timestamp, pushName, adContext, channel, visitorId, imageDataUrl } = parsed.data

    // Dedup check
    if (await isDuplicate(messageId)) {
      logger.debug({ messageId }, "Duplicate message — skipping")
      return reply.code(200).send({ status: "duplicate" })
    }

    // Replay guard — a reconnect can redeliver the same WhatsApp message under a
    // different/derived id, which the messageId dedup above won't catch. Dedup
    // on the (agent, sender, text) tuple within a short window so a redelivered
    // message can't trigger a second AI reply. Embed has its own delivery model.
    if (channel !== "embed" && (await isDuplicateContent(agentId, senderJid, text))) {
      logger.info({ agentId, fromPhone, messageId }, "Duplicate content within replay window — skipping")
      return reply.code(200).send({ status: "duplicate" })
    }

    // Enqueue for processing
    await inboundQueue.add("inbound", {
      agentId,
      messageId,
      fromPhone,
      senderJid,
      text,
      timestamp,
      pushName,
      adContext,
      channel,
      visitorId,
      imageDataUrl,
    })

    logger.info({ agentId, fromPhone, messageId }, "Inbound message enqueued")
    return reply.code(200).send({ status: "queued" })
  })
}
