import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { getRedis } from "../queue/redis.js"
import { getSessionByAgentId } from "../db/queries.js"
import {
  createBroadcast,
  listBroadcasts,
  getBroadcast,
  listBroadcastRecipients,
  resolveBroadcastRecipients,
  updateBroadcastStatus,
} from "../db/queries/broadcasts.js"
import { broadcastQueue } from "../queue/broadcast-queue.js"
import { sessionManager } from "../baileys/session-manager.js"
import { getTierConfig } from "../anti-ban/warmup.js"
import { logger as rootLogger } from "../lib/logger.js"
import type { WASocket } from "@whiskeysockets/baileys"

const logger = rootLogger.child({ module: "routes/broadcasts" })
const MAX_BROADCAST_RECIPIENTS = 200

const CreateSchema = z.object({
  agentId: z.string().min(1),
  message: z.string().min(1).max(1000),
  phoneNumbers: z.array(z.string().min(7)).min(1).max(MAX_BROADCAST_RECIPIENTS),
})

async function resolveDeliverableJid(sock: WASocket, rawPhone: string): Promise<string | null> {
  const digits = rawPhone.replace(/\D/g, "")
  if (!digits) return null

  const looksLikeLid = digits.length >= 15
  const preferred = looksLikeLid ? `${digits}@lid` : `${digits}@s.whatsapp.net`
  const fallback = looksLikeLid ? `${digits}@s.whatsapp.net` : `${digits}@lid`
  const candidates = [preferred, fallback]
  for (const candidate of candidates) {
    try {
      const checks = (await sock.onWhatsApp(candidate)) ?? []
      const match = checks.find((item) => item?.exists)
      if (match?.exists) return match.jid || candidate
    } catch {
      // Ignore candidate-level verification errors and try the next fallback.
    }
  }

  // Compatibility fallback: for some LID-only contacts, onWhatsApp may not confirm,
  // but direct send to the preferred JID can still succeed.
  return preferred
}

export const broadcastRoutes: FastifyPluginAsync = async (app) => {

  /**
   * POST /v1/broadcasts
   * Create and immediately start a broadcast campaign.
   */
  app.post("/broadcasts", async (req, reply) => {
    const body = CreateSchema.parse(req.body)

    // Check session exists and is connected
    const session = await getSessionByAgentId(body.agentId)
    if (!session) return reply.status(404).send({ error: "No session found for agent" })
    if (session.status !== "CONNECTED") return reply.status(400).send({ error: "WhatsApp session is not connected" })

    // Enforce recipient cap: can't exceed remaining daily capacity for the tier
    const tier = getTierConfig(session.warmupTier)
    const redis = getRedis()
    const dailyKey = `rl:daily:${body.agentId}:${new Date().toISOString().slice(0, 10)}`
    const usedToday = Number(await redis.get(dailyKey) ?? 0)
    const remaining = Math.max(0, tier.maxPerDay - usedToday)

    if (remaining === 0) {
      return reply.status(429).send({
        error: `Daily sending limit reached for tier ${session.warmupTier} (${tier.maxPerDay}/day)`,
      })
    }

    const uniquePhoneNumbers = Array.from(
      new Set(body.phoneNumbers.map((value) => value.replace(/\D/g, "")).filter((value) => value.length >= 7))
    )
    const eligibleRecipients = await resolveBroadcastRecipients(body.agentId, uniquePhoneNumbers)
    const sock = sessionManager.get(body.agentId)
    if (!sock) {
      return reply.status(400).send({ error: "WhatsApp socket is not active for this agent" })
    }

    const deliverableRecipients: typeof eligibleRecipients = []

    for (const recipient of eligibleRecipients) {
      const deliverableJid = await resolveDeliverableJid(sock, recipient.phoneNumber)
      if (!deliverableJid) continue

      deliverableRecipients.push({
        ...recipient,
        jid: deliverableJid,
      })
    }

    if (deliverableRecipients.length === 0) {
      return reply.status(400).send({
        error: "No deliverable recipients found. Contacts may be LID-only or no longer reachable on WhatsApp.",
      })
    }

    // Trim recipients to fit within remaining daily capacity
    const cappedRecipients = deliverableRecipients.slice(0, Math.min(remaining, MAX_BROADCAST_RECIPIENTS))
    const trimmed = deliverableRecipients.length - cappedRecipients.length
    const skipped = uniquePhoneNumbers.length - eligibleRecipients.length

    const campaign = await createBroadcast(
      body.agentId,
      body.message,
      cappedRecipients
    )

    // Start enqueuing asynchronously — don't block the HTTP response
    broadcastQueue.enqueueBroadcast(campaign.id).catch((err) => {
      logger.error({ broadcastId: campaign.id, err: err.message }, "Failed to enqueue broadcast")
    })

    logger.info({
      broadcastId: campaign.id,
      agentId: body.agentId,
      total: cappedRecipients.length,
      trimmed,
    }, "Broadcast created")

    return reply.status(201).send({
      broadcast: campaign,
      eligibleCount: deliverableRecipients.length,
      skipped: skipped > 0 ? skipped : undefined,
      trimmed: trimmed > 0 ? trimmed : undefined,
      message: [
        skipped > 0 ? `${skipped} numbers were ignored because they are not existing contacts.` : null,
        trimmed > 0 ? `${trimmed} eligible recipients were deferred to stay within the current safe sending limit.` : null,
      ].filter(Boolean).join(" ") || undefined,
    })
  })

  /**
   * GET /v1/broadcasts?agentId=xxx
   */
  app.get("/broadcasts", async (req, reply) => {
    const query = req.query as Record<string, string>
    if (!query.agentId) return reply.status(400).send({ error: "agentId required" })

    try {
      const broadcasts = await listBroadcasts(query.agentId)
      return reply.send({ broadcasts })
    } catch (err: any) {
      logger.error({ agentId: query.agentId, err }, "Failed to list broadcasts")

      // Graceful fallback while the broadcast tables are not present yet
      if (err?.code === "42P01") {
        return reply.send({ broadcasts: [], warning: "Broadcast tables not initialized yet" })
      }

      return reply.status(500).send({ error: err?.message ?? "Failed to list broadcasts" })
    }
  })

  /**
   * GET /v1/broadcasts/:id
   */
  app.get("/broadcasts/:id", async (req, reply) => {
    const { id } = req.params as { id: string }
    const broadcast = await getBroadcast(id)
    if (!broadcast) return reply.status(404).send({ error: "Broadcast not found" })
    const recipients = await listBroadcastRecipients(id)
    return reply.send({ broadcast, recipients })
  })

  /**
   * POST /v1/broadcasts/:id/cancel
   */
  app.post("/broadcasts/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string }
    const broadcast = await getBroadcast(id)
    if (!broadcast) return reply.status(404).send({ error: "Broadcast not found" })

    if (broadcast.status === "completed" || broadcast.status === "cancelled") {
      return reply.status(400).send({ error: `Broadcast is already ${broadcast.status}` })
    }

    await updateBroadcastStatus(id, "cancelled", { completedAt: true })
    logger.info({ broadcastId: id }, "Broadcast cancelled")
    return reply.send({ success: true })
  })

  /**
   * POST /v1/broadcasts/:id/resume
   * Resume a paused broadcast (re-enqueues pending recipients).
   */
  app.post("/broadcasts/:id/resume", async (req, reply) => {
    const { id } = req.params as { id: string }
    const broadcast = await getBroadcast(id)
    if (!broadcast) return reply.status(404).send({ error: "Broadcast not found" })

    if (broadcast.status !== "paused") {
      return reply.status(400).send({ error: "Only paused broadcasts can be resumed" })
    }

    // Clear consecutive failure counter
    const redis = getRedis()
    await redis.del(`bc:failures:${id}`)

    broadcastQueue.enqueueBroadcast(id).catch((err) => {
      logger.error({ broadcastId: id, err: err.message }, "Failed to resume broadcast")
    })

    return reply.send({ success: true })
  })
}
