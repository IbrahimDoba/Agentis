import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { getSessionByAgentId } from "../db/queries.js"
import { followUpQueue } from "../queue/followup-queue.js"
import { logger as rootLogger } from "../lib/logger.js"
import { sql } from "../db/client.js"

const logger = rootLogger.child({ module: "routes/followup" })

const StartSchema = z.object({
  agentId: z.string().min(1),
})

export const followUpRoutes: FastifyPluginAsync = async (app) => {

  /**
   * POST /v1/followup-campaigns/:id/start
   * Enqueue all approved messages for sending.
   */
  app.post("/followup-campaigns/:id/start", async (req, reply) => {
    const { id: campaignId } = req.params as { id: string }
    const body = StartSchema.parse(req.body)

    const session = await getSessionByAgentId(body.agentId)
    if (!session) return reply.status(404).send({ error: "No session found for agent" })
    if (session.status !== "CONNECTED") {
      return reply.status(400).send({ error: "WhatsApp session is not connected" })
    }

    const campaigns = await sql<{ id: string; status: string }[]>`
      SELECT "id", "status" FROM "FollowUpCampaign"
      WHERE "id" = ${campaignId} AND "agentId" = ${body.agentId}
      LIMIT 1
    `
    const campaign = campaigns[0]
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" })

    // Fire enqueue async — don't block HTTP response
    followUpQueue.enqueueFollowUpCampaign(campaignId, body.agentId).catch((err) => {
      logger.error({ campaignId, err: err.message }, "Failed to enqueue follow-up campaign")
    })

    logger.info({ campaignId, agentId: body.agentId }, "Follow-up campaign start requested")
    return reply.send({ ok: true })
  })

  /**
   * POST /v1/followup-campaigns/:id/cancel
   * Mark campaign cancelled — in-flight BullMQ jobs check status before sending.
   */
  app.post("/followup-campaigns/:id/cancel", async (req, reply) => {
    const { id: campaignId } = req.params as { id: string }

    await sql`
      UPDATE "FollowUpCampaign"
      SET "status" = 'cancelled', "completedAt" = NOW()
      WHERE "id" = ${campaignId}
    `

    logger.info({ campaignId }, "Follow-up campaign cancelled via worker")
    return reply.send({ ok: true })
  })
}
