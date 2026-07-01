import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { chargeAiTurn } from "../billing/charge.js"

const chargeSchema = z.object({
  agentId: z.string(),
  conversationId: z.string().optional(),
  tokensInput: z.number().int().min(0).optional(),
  tokensOutput: z.number().int().min(0).optional(),
  messageType: z.enum(["text", "image"]).optional(),
})

// Record credits for an AI turn that bypasses the WhatsApp send queue — used by
// the embed widget, whose replies are delivered by the orchestrator directly
// (no Baileys send, so the outbound queue's billing never runs). Auth is
// enforced globally by the WORKER_API_KEY onRequest hook.
export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/billing/charge", async (req, reply) => {
    const body = chargeSchema.parse(req.body)
    const result = await chargeAiTurn(body)
    reply.code(200).send({ ok: true, ...(result ?? {}) })
  })
}
