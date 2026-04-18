import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { outboundQueue } from "../queue/outbound-queue.js"
import { RateLimitError } from "../lib/errors.js"

const sendSchema = z.object({
  agentId: z.string(),
  to: z.string(), // E.164 digits or JID
  text: z.string().min(1),
  conversationId: z.string().optional(),
  source: z.enum(["ai", "human"]).default("ai"),
})

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.post("/messages/send", async (req, reply) => {
    const body = sendSchema.parse(req.body)

    const toJid = body.to.includes("@") ? body.to : `${body.to}@s.whatsapp.net`

    const job = await outboundQueue.enqueue({
      agentId: body.agentId,
      toJid,
      text: body.text,
      conversationId: body.conversationId,
      source: body.source,
    })

    if (!job) throw new RateLimitError("Daily or hourly cap reached")

    reply.code(202).send({ jobId: job.id, status: "queued" })
  })
}
