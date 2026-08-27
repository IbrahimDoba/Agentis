import { Queue, Worker, type Job } from "bullmq"
import { getRedis } from "./redis.js"
import { isLeader } from "../lib/leader.js"
import { sessionManager } from "../baileys/session-manager.js"
import { sendWithPacing } from "../anti-ban/pacing.js"
import { checkAndIncrement } from "../anti-ban/rate-limiter.js"
import { getSessionByAgentId } from "../db/queries.js"
import { truncatedNormal } from "../anti-ban/distribution.js"
import { logger as rootLogger } from "../lib/logger.js"
import { sql } from "../db/client.js"
import { resolveSendJid } from "../baileys/resolve-jid.js"
import { recordEvent } from "../lib/event-log.js"
import { chargeAiCredits, hasCreditHeadroom } from "../billing/charge.js"
import { creditsForMessageType } from "../billing/credits.js"

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

    // Only the leader holds WhatsApp sockets — a standby must not process sends.
    // Bounce the job back so the leader picks it up.
    if (!isLeader()) {
      await queue.add("send", job.data, { delay: 3_000 })
      return
    }

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

    // Resolve the routable JID. WhatsApp addresses many contacts by LID;
    // sending to the stored phone JID (@s.whatsapp.net) silently fails for those
    // — the message gets marked "sent" but never arrives. Resolve to the LID and
    // send to that. Done BEFORE the rate-limit slot so an unreachable contact
    // doesn't burn daily quota.
    const sendJid = await resolveSendJid(sock, toJid)
    if (!sendJid) {
      await sql`
        UPDATE "FollowUpMessage"
        SET "status" = 'failed', "error" = 'Recipient is not currently reachable on WhatsApp'
        WHERE "id" = ${messageId}
      `
      await sql`
        UPDATE "FollowUpCampaign"
        SET "totalSkipped" = "totalSkipped" + 1
        WHERE "id" = ${campaignId}
      `
      logger.warn({ campaignId, messageId, toJid }, "Follow-up recipient not reachable — marking failed")
      void recordEvent({ level: "warn", category: "followup.unreachable", agentId, message: "Follow-up recipient not reachable on WhatsApp", detail: { campaignId, messageId, toJid } })
      return
    }

    // Anti-ban rate limiting
    await checkAndIncrement(agentId, session.warmupTier)

    // Credit gate — a follow-up send costs the same as a normal WhatsApp text.
    // Out of funds → stop the campaign (status 'failed' is this feature's
    // resumable-stop, recovered by resetForResume + re-enqueue). Leave THIS
    // message 'scheduled' (return without marking sent) so the resume re-sends
    // it. The exact charge runs after a confirmed send, so only delivered
    // messages are billed. Mirrors the broadcast credit gate.
    if (!(await hasCreditHeadroom(agentId))) {
      logger.warn({ campaignId, messageId, agentId }, "Insufficient credits — stopping follow-up campaign (messages stay resumable)")
      await sql`UPDATE "FollowUpCampaign" SET "status" = 'failed' WHERE "id" = ${campaignId}`
      void recordEvent({ level: "warn", category: "followup.stopped_no_credits", agentId, message: "Follow-up campaign stopped — insufficient credits", detail: { campaignId, messageId } })
      return
    }

    // Personalize: replace {name} placeholder
    const firstName = contactName?.split(" ")[0]
    const personalizedMessage = firstName
      ? message.replace(/\{name\}/gi, firstName)
      : message.replace(/\{name\},?\s*/gi, "")

    try {
      await sendWithPacing(sock, sendJid, personalizedMessage, session.warmupTier)

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

      // Bill the delivered follow-up: 5 credits, same as a normal text send,
      // tagged source "followup" for separate accounting. Best-effort — it
      // already went out, so a billing hiccup must never fail the send (the
      // gate above already stopped broke accounts before sending).
      try {
        await chargeAiCredits({ agentId, credits: creditsForMessageType("text"), messageType: "text", conversationId, source: "followup" })
      } catch (err: any) {
        logger.warn({ campaignId, messageId, err: err?.message }, "Follow-up credit charge failed after send")
      }

      // Reset consecutive failure counter
      await getRedis().del(`fu:failures:${campaignId}`)

      logger.info({ campaignId, messageId, toJid }, "Follow-up message sent")
    } catch (err: any) {
      void recordEvent({ level: "warn", category: "followup.send_failed", agentId, message: err?.message ?? "follow-up send failed", detail: { campaignId, messageId, toJid, sendJid } })
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
 *
 * Send window: when `spreadHours` is omitted it AUTO-SCALES with campaign size to
 * stay near a safe ~1000 sends / 24h — so a large "message everyone" campaign
 * spreads over multiple days (e.g. 2000 msgs → ~48h) instead of blasting them in
 * 24h. An explicit `spreadHours` overrides (e.g. 2h to compress a small re-run).
 */
export async function enqueueFollowUpCampaign(
  campaignId: string,
  agentId: string,
  spreadHours?: number
): Promise<void> {
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

  // Default window auto-scales with size (~1000 sends / 24h) so big campaigns
  // spread over multiple days; an explicit spreadHours overrides (e.g. compress
  // a re-run). Clamped to [0.5h, 7d] so it can't be set to never-sends or a rate
  // that hammers the number past the anti-ban pacing floor.
  const SAFE_SENDS_PER_DAY = 1000
  const autoHours = Math.max(24, (messages.length / SAFE_SENDS_PER_DAY) * 24)
  const clampedHours = Math.min(168, Math.max(0.5, spreadHours ?? autoHours))
  const windowMs = clampedHours * 60 * 60 * 1000
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
    spreadHours: clampedHours,
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
