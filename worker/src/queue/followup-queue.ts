import { Queue, Worker, type Job } from "bullmq"
import { getRedis } from "./redis.js"
import { sessionManager } from "../baileys/session-manager.js"
import { sendWithPacing } from "../anti-ban/pacing.js"
import { checkAndIncrement } from "../anti-ban/rate-limiter.js"
import { getSessionByAgentId } from "../db/queries.js"
import { truncatedNormal } from "../anti-ban/distribution.js"
import { logger as rootLogger } from "../lib/logger.js"
import { sql } from "../db/client.js"

const logger = rootLogger.child({ module: "followup-queue" })
const QUEUE_NAME = "followup-send"
const MAX_CONSECUTIVE_FAILURES = 3

export interface FollowUpJob {
  campaignId: string
  messageId: string
  agentId: string
  toJid: string
  message: string
  conversationId: string
  contactName: string | null
  batchIndex: number
}

const queue = new Queue<FollowUpJob>(QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
})

const worker = new Worker<FollowUpJob>(
  QUEUE_NAME,
  async (job: Job<FollowUpJob>) => {
    const { campaignId, messageId, agentId, toJid, message, conversationId, contactName } = job.data

    // Check campaign is still sending
    const campaigns = await sql<{ status: string }[]>`
      SELECT "status" FROM "FollowUpCampaign" WHERE "id" = ${campaignId} LIMIT 1
    `
    const campaign = campaigns[0]
    if (!campaign || campaign.status === "cancelled") {
      await sql`UPDATE "FollowUpMessage" SET "status" = 'skipped' WHERE "id" = ${messageId}`
      logger.info({ campaignId, messageId }, "Follow-up campaign stopped — skipping")
      return
    }

    // Idempotency: never re-send a message that already went out. Guards against
    // resume re-enqueues, stale delayed jobs, and BullMQ retries all landing on
    // the same message.
    const msgRows = await sql<{ status: string }[]>`
      SELECT "status" FROM "FollowUpMessage" WHERE "id" = ${messageId} LIMIT 1
    `
    if (msgRows[0]?.status === "sent") {
      logger.info({ campaignId, messageId }, "Follow-up message already sent — skipping duplicate")
      return
    }

    const sock = sessionManager.get(agentId)
    if (!sock) throw new Error(`No active session for agent ${agentId}`)

    const session = await getSessionByAgentId(agentId)
    if (!session) throw new Error(`Session record not found for agent ${agentId}`)

    // Anti-ban rate limiting
    await checkAndIncrement(agentId, session.warmupTier)

    // Personalize: replace {name} placeholder
    const firstName = contactName?.split(" ")[0]
    const personalizedMessage = firstName
      ? message.replace(/\{name\}/gi, firstName)
      : message.replace(/\{name\},?\s*/gi, "")

    try {
      await sendWithPacing(sock, toJid, personalizedMessage, session.warmupTier)

      // Mark message sent + update conversation lastFollowedUpAt
      await sql`
        UPDATE "FollowUpMessage"
        SET "status" = 'sent', "sentAt" = NOW()
        WHERE "id" = ${messageId}
      `
      await sql`
        UPDATE "Conversation"
        SET "lastFollowedUpAt" = NOW()
        WHERE "id" = ${conversationId}
      `
      await sql`
        UPDATE "FollowUpCampaign"
        SET "totalSent" = "totalSent" + 1
        WHERE "id" = ${campaignId}
      `

      // Reset consecutive failure counter
      await getRedis().del(`fu:failures:${campaignId}`)

      logger.info({ campaignId, messageId, toJid }, "Follow-up message sent")
    } catch (err: any) {
      await sql`
        UPDATE "FollowUpMessage"
        SET "status" = 'failed', "error" = ${err.message}
        WHERE "id" = ${messageId}
      `
      await sql`
        UPDATE "FollowUpCampaign"
        SET "totalSkipped" = "totalSkipped" + 1
        WHERE "id" = ${campaignId}
      `

      const redis = getRedis()
      const key = `fu:failures:${campaignId}`
      const failures = await redis.incr(key)
      await redis.expire(key, 3600)

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        logger.warn({ campaignId, failures }, "Auto-pausing follow-up campaign — too many failures")
        await sql`UPDATE "FollowUpCampaign" SET "status" = 'failed' WHERE "id" = ${campaignId}`
        await redis.del(key)
      }

      throw err
    }
  },
  { connection: getRedis(), concurrency: 1 }
)

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, campaignId: job?.data.campaignId, err: err.message }, "Follow-up job failed")
})

worker.on("completed", async (job) => {
  const { campaignId } = job.data
  // Check if all messages are done
  const rows = await sql<{ total: number; done: number }[]>`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE "status" IN ('sent', 'skipped', 'failed', 'rejected'))::int as done
    FROM "FollowUpMessage"
    WHERE "campaignId" = ${campaignId}
      AND "status" != 'rejected'
  `
  const { total, done } = rows[0] ?? { total: 0, done: 0 }
  if (total > 0 && done >= total) {
    await sql`
      UPDATE "FollowUpCampaign"
      SET "status" = 'completed', "completedAt" = NOW()
      WHERE "id" = ${campaignId} AND "status" = 'sending'
    `
    logger.info({ campaignId }, "Follow-up campaign completed")
  }
})

/**
 * Enqueue all approved messages for a campaign with progressive delays.
 * Spreads messages over ~24h or the natural anti-ban pacing, whichever is longer.
 */
export async function enqueueFollowUpCampaign(campaignId: string, agentId: string): Promise<void> {
  const messages = await sql<{
    id: string
    toJid: string
    message: string
    conversationId: string
    contactName: string | null
  }[]>`
    SELECT "id", "jid" as "toJid", "generatedMessage" as "message",
           "conversationId", "contactName"
    FROM "FollowUpMessage"
    WHERE "campaignId" = ${campaignId}
      AND "status" = 'approved'
    ORDER BY "createdAt" ASC
  `

  if (messages.length === 0) return

  // Spread messages over 24h minimum
  const windowMs = 24 * 60 * 60 * 1000
  const minSpacingMs = Math.floor(windowMs / messages.length)

  let cumulativeDelayMs = 0

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // Use whichever is larger: natural anti-ban delay or 24h spread
    const naturalDelay = truncatedNormal(8_000, 20_000)
    const spacingDelay = Math.max(naturalDelay, minSpacingMs)
    cumulativeDelayMs += spacingDelay

    // Batch break every 10 messages
    if (i > 0 && i % 10 === 0) {
      cumulativeDelayMs += truncatedNormal(60_000, 120_000)
    }

    // Mark as scheduled with expected send time
    const scheduledAt = new Date(Date.now() + cumulativeDelayMs)
    await sql`
      UPDATE "FollowUpMessage"
      SET "status" = 'scheduled', "scheduledAt" = ${scheduledAt.toISOString()}::timestamptz
      WHERE "id" = ${msg.id}
    `

    await queue.add(
      "send",
      {
        campaignId,
        messageId: msg.id,
        agentId,
        toJid: msg.toJid,
        message: msg.message,
        conversationId: msg.conversationId,
        contactName: msg.contactName,
        batchIndex: i,
      },
      { delay: cumulativeDelayMs }
    )
  }

  logger.info({
    campaignId,
    total: messages.length,
    estimatedDurationMs: cumulativeDelayMs,
  }, "Follow-up campaign enqueued")
}

/**
 * Reset a failed campaign so it can be re-enqueued. Touches three places:
 *   1. FollowUpMessage rows in `failed` state → reset to `approved`, clear error
 *      and scheduledAt (they had no successful send, safe to retry).
 *   2. FollowUpMessage rows in `scheduled` state whose scheduledAt is already
 *      in the past → these had a BullMQ job that never completed (worker
 *      crashed, campaign was auto-paused, etc.); reset to `approved` so the
 *      re-enqueue picks them up. Future-scheduled rows are left alone — their
 *      BullMQ job is still pending and will fire on time.
 *   3. FollowUpCampaign: status → `sending`, clear completedAt.
 *
 * The Redis failure counter is also cleared so a fresh burst of failures
 * doesn't immediately re-trigger the auto-pause.
 *
 * Does NOT re-enqueue. Caller invokes enqueueFollowUpCampaign separately so
 * the route can fire-and-forget the heavy work while returning a count.
 *
 * Returns the number of rows that were reset back to `approved` and will be
 * picked up by the next enqueue pass.
 */
export async function resetForResume(campaignId: string): Promise<number> {
  const failedReset = await sql<{ id: string }[]>`
    UPDATE "FollowUpMessage"
    SET "status" = 'approved', "error" = NULL, "scheduledAt" = NULL
    WHERE "campaignId" = ${campaignId} AND "status" = 'failed'
    RETURNING "id"
  `

  const stuckReset = await sql<{ id: string }[]>`
    UPDATE "FollowUpMessage"
    SET "status" = 'approved', "scheduledAt" = NULL
    WHERE "campaignId" = ${campaignId}
      AND "status" = 'scheduled'
      AND "scheduledAt" < NOW() - INTERVAL '2 minutes'
    RETURNING "id"
  `

  await sql`
    UPDATE "FollowUpCampaign"
    SET "status" = 'sending', "completedAt" = NULL
    WHERE "id" = ${campaignId}
  `

  const redis = getRedis()
  await redis.del(`fu:failures:${campaignId}`).catch(() => {})

  const total = failedReset.length + stuckReset.length
  logger.info({ campaignId, requeued: total, failed: failedReset.length, stuck: stuckReset.length }, "Follow-up campaign reset for resume")
  return total
}

export async function closeFollowUpQueue(): Promise<void> {
  await worker.close()
  await queue.close()
}

export const followUpQueue = { enqueueFollowUpCampaign, resetForResume, close: closeFollowUpQueue }
