import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { outboundQueue } from "../queue/outbound-queue.js"
import { RateLimitError } from "../lib/errors.js"

const sendSchema = z.object({
  agentId: z.string(),
  to: z.string(), // E.164 digits or JID
  text: z.string().default(""),
  mediaUrl: z.string().url().optional(),
  type: z.enum(["text", "image"]).default("text"),
  conversationId: z.string().optional(),
  source: z.enum(["ai", "human", "api"]).default("ai"),
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
      conversationId: body.conversationId,
      source: body.source,
      tokensInput: body.tokensInput,
      tokensOutput: body.tokensOutput,
    })

    if (!job) throw new RateLimitError("Daily or hourly cap reached")

    reply.code(202).send({ jobId: job.id, status: "queued" })
  })
}
