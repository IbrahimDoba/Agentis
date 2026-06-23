import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { sessionManager } from "../baileys/session-manager.js"
import { resolvePhone } from "../baileys/contacts-store.js"
import { listWhatsAppLabels, addChatLabelAssoc, removeChatLabelAssoc } from "../db/labels.js"

// Resolve a phone number for ChatLabel.phoneNumber (for joining to Conversation
// in the dashboard). If `to` was a plain number, use its digits; otherwise try
// the contact store.
function phoneFor(agentId: string, to: string, toJid: string): string | null {
  if (!to.includes("@")) return to.replace(/\D/g, "") || null
  const resolved = resolvePhone(agentId, toJid)
  return resolved && resolved !== toJid ? resolved : null
}

export const labelRoutes: FastifyPluginAsync = async (app) => {
  // List labels synced from the connected WhatsApp Business account (with a
  // per-label chat count). Bearer-auth is applied globally by the worker.
  app.get("/labels", async (req, reply) => {
    const { agentId } = z.object({ agentId: z.string().min(1) }).parse(req.query)
    const labels = await listWhatsAppLabels(agentId)
    return reply.send({ labels })
  })

  // Apply a label to a chat (manual operator tag or AI tag). Best-effort on the
  // WhatsApp side, then mirror into our DB (the labels.association echo is a
  // harmless no-op via ON CONFLICT).
  app.post("/labels/assign", async (req, reply) => {
    const body = z.object({
      agentId: z.string().min(1),
      to: z.string().min(1),
      waLabelId: z.string().min(1),
      appliedBy: z.enum(["ai", "operator"]).default("operator"),
    }).parse(req.body)

    const sock = sessionManager.get(body.agentId)
    if (!sock) return reply.code(409).send({ error: "WhatsApp session is not connected" })
    const toJid = body.to.includes("@") ? body.to : `${body.to}@s.whatsapp.net`

    try {
      await sock.addChatLabel(toJid, body.waLabelId)
    } catch (err) {
      req.log.error({ err, agentId: body.agentId, waLabelId: body.waLabelId }, "addChatLabel failed")
      return reply.code(502).send({ error: "Failed to apply label on WhatsApp" })
    }
    await addChatLabelAssoc(body.agentId, toJid, phoneFor(body.agentId, body.to, toJid), body.waLabelId, body.appliedBy)
      .catch((err) => req.log.warn({ err }, "ChatLabel record failed (label applied on WhatsApp)"))
    return reply.send({ ok: true })
  })

  // Remove a label from a chat.
  app.post("/labels/remove", async (req, reply) => {
    const body = z.object({
      agentId: z.string().min(1),
      to: z.string().min(1),
      waLabelId: z.string().min(1),
    }).parse(req.body)

    const sock = sessionManager.get(body.agentId)
    if (!sock) return reply.code(409).send({ error: "WhatsApp session is not connected" })
    const toJid = body.to.includes("@") ? body.to : `${body.to}@s.whatsapp.net`

    try {
      await sock.removeChatLabel(toJid, body.waLabelId)
    } catch (err) {
      req.log.error({ err, agentId: body.agentId, waLabelId: body.waLabelId }, "removeChatLabel failed")
      return reply.code(502).send({ error: "Failed to remove label on WhatsApp" })
    }
    await removeChatLabelAssoc(body.agentId, toJid, body.waLabelId)
      .catch((err) => req.log.warn({ err }, "ChatLabel delete failed (label removed on WhatsApp)"))
    return reply.send({ ok: true })
  })
}
