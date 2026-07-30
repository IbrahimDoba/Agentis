import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { chargeAiTurn, hasCreditHeadroom } from "../billing/charge.js"

const chargeSchema = z.object({
  agentId: z.string(),
  conversationId: z.string().optional(),
  tokensInput: z.number().int().min(0).optional(),
  tokensOutput: z.number().int().min(0).optional(),
  messageType: z.enum(["text", "image"]).optional(),
})

const canAffordSchema = z.object({ agentId: z.string().min(1) })

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

  // Pre-generation gate: the orchestrator calls this BEFORE running the LLM so it
  // can skip generating a reply the account can't fund (saves tokens + avoids an
  // undelivered reply row). Same billing truth as the send-time gate.
  app.get("/billing/can-afford", async (req, reply) => {
    const { agentId } = canAffordSchema.parse(req.query)
    const canAfford = await hasCreditHeadroom(agentId)
    reply.code(200).send({ canAfford })
  })
}
