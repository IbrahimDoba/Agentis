import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { isDuplicate } from "../orchestrator/dedup.js"
import { inboundQueue } from "../queue/queues.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "route:inbound" })

const inboundSchema = z.object({
  agentId: z.string().min(1),
  messageId: z.string().min(1),
  fromPhone: z.string().min(1),
  senderJid: z.string().min(1),
  text: z.string().min(1),
  timestamp: z.number(),
  transportType: z.string().optional(),
})

export async function inboundRoutes(app: FastifyInstance) {
  app.post("/inbound", async (req, reply) => {
    const parsed = inboundSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() })
    }

    const { agentId, messageId, fromPhone, senderJid, text, timestamp } = parsed.data

    // Dedup check
    if (await isDuplicate(messageId)) {
      logger.debug({ messageId }, "Duplicate message — skipping")
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
    })

    logger.info({ agentId, fromPhone, messageId }, "Inbound message enqueued")
    return reply.code(200).send({ status: "queued" })
  })
}
