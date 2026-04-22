import { Queue, Worker, type Job } from "bullmq"
import { getRedis } from "./redis.js"
import { sessionManager } from "../baileys/session-manager.js"
import { sendWithPacing } from "../anti-ban/pacing.js"
import { checkAndIncrement } from "../anti-ban/rate-limiter.js"
import { getSessionByAgentId } from "../db/queries.js"
import {
  getBroadcast,
  updateBroadcastStatus,
  updateRecipientStatus,
  incrementBroadcastSent,
  incrementBroadcastFailed,
  getPendingRecipients,
} from "../db/queries/broadcasts.js"
import { truncatedNormal } from "../anti-ban/distribution.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "broadcast-queue" })
const QUEUE_NAME = "broadcast-send"

// Consecutive failure threshold before auto-pausing
const MAX_CONSECUTIVE_FAILURES = 3

async function isDeliverable(sock: ReturnType<typeof sessionManager.get>, toJid: string): Promise<boolean> {
  if (!sock) return false
  if (toJid.endsWith("@lid")) return true
  try {
    const checks = (await sock.onWhatsApp(toJid)) ?? []
    return checks.some((item) => item?.exists)
  } catch {
    return false
  }
}

export interface BroadcastJob {
  broadcastId: string
  recipientId: string
  agentId: string
  toJid: string
  message: string
  contactName: string | null
  batchIndex: number  // position within the broadcast (0-based)
}

const queue = new Queue<BroadcastJob>(QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
})

const worker = new Worker<BroadcastJob>(
  QUEUE_NAME,
  async (job: Job<BroadcastJob>) => {
    const { broadcastId, recipientId, agentId, toJid, message, contactName, batchIndex } = job.data

    // Check broadcast is still running before doing anything
    const broadcast = await getBroadcast(broadcastId)
    if (!broadcast || broadcast.status === "cancelled" || broadcast.status === "paused") {
      logger.info({ broadcastId, recipientId }, "Broadcast stopped — skipping recipient")
      await updateRecipientStatus(recipientId, "skipped")
      return
    }

    // Check session
    const sock = sessionManager.get(agentId)
    if (!sock) throw new Error(`No active session for agent ${agentId}`)

    const session = await getSessionByAgentId(agentId)
    if (!session) throw new Error(`Session record not found for agent ${agentId}`)

    const deliverable = await isDeliverable(sock, toJid)
    if (!deliverable) {
      await updateRecipientStatus(recipientId, "failed", "Recipient is not currently deliverable on WhatsApp")
      await incrementBroadcastFailed(broadcastId)
      logger.warn({ broadcastId, recipientId, toJid }, "Recipient is not deliverable — skipping send")
      return
    }

    // Check daily/hourly rate limit — throws RateLimitError if exceeded
    await checkAndIncrement(agentId, session.warmupTier)

    // Personalize message — replace {name} with contact name if available
    const personalizedMessage = contactName
      ? message.replace(/\{name\}/gi, contactName.split(" ")[0])
      : message.replace(/\{name\},?\s*/gi, "")

    try {
      await sendWithPacing(sock, toJid, personalizedMessage, session.warmupTier)
      await updateRecipientStatus(recipientId, "sent")
      await incrementBroadcastSent(broadcastId)

      // Reset consecutive failure counter on success
      const redis = getRedis()
      await redis.del(`bc:failures:${broadcastId}`)

      logger.info({ broadcastId, recipientId, toJid, batchIndex }, "Broadcast message sent")
    } catch (err: any) {
      await updateRecipientStatus(recipientId, "failed", err.message)
      await incrementBroadcastFailed(broadcastId)

      // Track consecutive failures — auto-pause after threshold
      const redis = getRedis()
      const key = `bc:failures:${broadcastId}`
      const failures = await redis.incr(key)
      await redis.expire(key, 3600)

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        logger.warn({ broadcastId, failures }, "Auto-pausing broadcast — too many consecutive failures")
        await updateBroadcastStatus(broadcastId, "paused")
        await redis.del(key)
      }

      throw err
    }
  },
  {
    connection: getRedis(),
    concurrency: 1, // one at a time — critical for anti-ban
  }
)

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, broadcastId: job?.data.broadcastId, err: err.message }, "Broadcast job failed")
})

worker.on("completed", async (job) => {
  // After each job, check if all recipients are done and mark broadcast completed
  const { broadcastId } = job.data
  const broadcast = await getBroadcast(broadcastId)
  if (!broadcast) return

  const isDone = broadcast.status === "running" &&
    (broadcast.sentCount + broadcast.failedCount) >= broadcast.totalCount

  if (isDone) {
    const finalStatus = broadcast.failedCount === broadcast.totalCount ? "failed" : "completed"
    await updateBroadcastStatus(broadcastId, finalStatus, { completedAt: true })
    logger.info({ broadcastId, finalStatus }, "Broadcast completed")
  }
})

/**
 * Enqueue all recipients of a broadcast with progressive anti-ban delays.
 *
 * Delay schedule (cumulative):
 *   - Between messages: random 8–20s
 *   - Every 10 messages (batch break): +60–120s extra
 */
export async function enqueueBroadcast(broadcastId: string): Promise<void> {
  const broadcast = await getBroadcast(broadcastId)
  if (!broadcast) throw new Error(`Broadcast ${broadcastId} not found`)

  const recipients = await getPendingRecipients(broadcastId)
  if (recipients.length === 0) return

  await updateBroadcastStatus(broadcastId, "running", { startedAt: true })

  let cumulativeDelayMs = 0

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]

    // Add inter-message delay
    cumulativeDelayMs += truncatedNormal(8_000, 20_000)

    // Every 10 messages: add a batch break
    if (i > 0 && i % 10 === 0) {
      const batchBreak = truncatedNormal(60_000, 120_000)
      cumulativeDelayMs += batchBreak
      logger.debug({ broadcastId, index: i, batchBreak }, "Batch break scheduled")
    }

    await queue.add(
      "send",
      {
        broadcastId,
        recipientId: r.id,
        agentId: broadcast.agentId,
        toJid: r.jid,
        message: broadcast.message,
        contactName: r.contactName,
        batchIndex: i,
      },
      { delay: cumulativeDelayMs }
    )
  }

  logger.info({
    broadcastId,
    totalRecipients: recipients.length,
    estimatedDurationMs: cumulativeDelayMs,
  }, "Broadcast enqueued")
}

export async function closeBroadcastQueue(): Promise<void> {
  await worker.close()
  await queue.close()
}

export const broadcastQueue = { enqueueBroadcast, close: closeBroadcastQueue }
