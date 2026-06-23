import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { listWhatsAppLabels } from "../db/labels.js"

// Read the labels synced from a connected WhatsApp Business account (with a
// per-label chat count). Used to confirm sync works on a real number and to
// feed the dashboard. Bearer-auth is applied globally by the worker.
export const labelRoutes: FastifyPluginAsync = async (app) => {
  app.get("/labels", async (req, reply) => {
    const { agentId } = z.object({ agentId: z.string().min(1) }).parse(req.query)
    const labels = await listWhatsAppLabels(agentId)
    return reply.send({ labels })
  })
}
