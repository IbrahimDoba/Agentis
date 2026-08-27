import { Queue, Worker, type Job } from "bullmq"
import { getRedis } from "./redis.js"
import { isLeader } from "../lib/leader.js"
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
  getRecipient,
  saveBroadcastOutboundMessage,
} from "../db/queries/broadcasts.js"
import { RateLimitError } from "../lib/errors.js"
import { truncatedNormal } from "../anti-ban/distribution.js"
import { logger as rootLogger } from "../lib/logger.js"
import { resolveSendJid } from "../baileys/resolve-jid.js"
import { recordEvent } from "../lib/event-log.js"
import { resolveSpreadHours } from "../anti-ban/spread-window.js"
import { chargeAiCredits, hasCreditHeadroom } from "../billing/charge.js"
import { creditsForMessageType } from "../billing/credits.js"

const logger = rootLogger.child({ module: "broadcast-queue" })
const QUEUE_NAME = "broadcast-send"

// Consecutive failure threshold before auto-pausing
const MAX_CONSECUTIVE_FAILURES = 3

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

    // Only the leader holds WhatsApp sockets — a standby must not process sends.
    // Bounce the job back so the leader picks it up.
    if (!isLeader()) {
      await queue.add("send", job.data, { delay: 3_000 })
      return
    }

    // Cancelled → terminal skip. Paused → leave the recipient PENDING so a
    // resume re-sends it (don't mark it skipped, or it'd be lost to resume).
    const broadcast = await getBroadcast(broadcastId)
    if (!broadcast || broadcast.status === "cancelled") {
      await updateRecipientStatus(recipientId, "skipped")
      return
    }
    if (broadcast.status === "paused") {
      logger.info({ broadcastId, recipientId }, "Broadcast paused — leaving recipient pending for resume")
      return
    }

    // Idempotency: never double-send. Guards against resume re-enqueues, stale
    // delayed jobs, and BullMQ retries all hitting the same recipient.
    const recipient = await getRecipient(recipientId)
    if (recipient?.status === "sent") {
      logger.info({ broadcastId, recipientId }, "Recipient already sent — skipping duplicate")
      return
    }
    const alreadyFailed = recipient?.status === "failed"

    // Session gone (e.g. WhatsApp reconnecting mid-broadcast). PAUSE the
    // broadcast — visible + resumable — instead of throwing the recipient into
    // a silent 'pending' limbo it never recovers from.
    const sock = sessionManager.get(agentId)
    if (!sock) {
      logger.warn({ broadcastId, agentId }, "No active session — pausing broadcast (recipients stay pending)")
      await updateBroadcastStatus(broadcastId, "paused")
      return
    }

    const session = await getSessionByAgentId(agentId)
    if (!session || session.status !== "CONNECTED") {
      // The socket can be present but the link isn't actually up (e.g. mid
      // reconnect right after a QR re-scan). Sending now would "succeed" without
      // delivering — pause so a resume re-sends once the link is truly back.
      logger.warn({ broadcastId, agentId, status: session?.status }, "Session not connected — pausing broadcast (recipients stay pending)")
      await updateBroadcastStatus(broadcastId, "paused")
      return
    }

    // Re-resolve the canonical JID at send time — one stored at creation may no
    // longer route after a re-link.
    const sendJid = await resolveSendJid(sock, toJid)
    if (!sendJid) {
      await updateRecipientStatus(recipientId, "failed", "Recipient is not currently deliverable on WhatsApp")
      if (!alreadyFailed) await incrementBroadcastFailed(broadcastId)
      logger.warn({ broadcastId, recipientId, toJid }, "Recipient is not deliverable — marking failed")
      return
    }

    // Daily rate limit — pause (resumable) instead of dropping the recipient.
    try {
      await checkAndIncrement(agentId, session.warmupTier)
    } catch (err) {
      if (err instanceof RateLimitError) {
        logger.warn({ broadcastId, agentId, err: err.message }, "Daily limit reached — pausing broadcast (recipients stay pending)")
        await updateBroadcastStatus(broadcastId, "paused")
        return
      }
      throw err
    }

    // Credit gate — a broadcast send costs the same as a normal WhatsApp text.
    // Out of funds → PAUSE (resumable), leaving the recipient pending, exactly
    // like the daily-limit and session-down cases above. hasCreditHeadroom is a
    // cheap conservative check ("can the account pay at all"); the exact charge
    // runs after a confirmed send so only delivered messages are billed.
    if (!(await hasCreditHeadroom(agentId))) {
      logger.warn({ broadcastId, agentId }, "Insufficient credits — pausing broadcast (recipients stay pending)")
      await updateBroadcastStatus(broadcastId, "paused")
      void recordEvent({ level: "warn", category: "broadcast.paused_no_credits", agentId, message: "Broadcast paused — insufficient credits", detail: { broadcastId, recipientId } })
      return
    }

    // Personalize message — replace {name} with contact name if available
    const personalizedMessage = contactName
      ? message.replace(/\{name\}/gi, contactName.split(" ")[0])
      : message.replace(/\{name\},?\s*/gi, "")

    try {
      await sendWithPacing(sock, sendJid, personalizedMessage, session.warmupTier)
      await updateRecipientStatus(recipientId, "sent")
      await incrementBroadcastSent(broadcastId)

      // Bill the delivered message: 5 credits, same as a normal text send,
      // tagged source "broadcast" for separate accounting. Best-effort — it
      // already went out, so a billing hiccup must never fail the send (the
      // headroom gate above already stopped broke accounts before sending).
      try {
        await chargeAiCredits({ agentId, credits: creditsForMessageType("text"), messageType: "text", source: "broadcast" })
      } catch (err: any) {
        logger.warn({ broadcastId, recipientId, err: err?.message }, "Broadcast credit charge failed after send")
      }

      // Surface the broadcast in the recipient's inbox thread. Best-effort —
      // a persistence hiccup must never fail the actual send. Keeps the
      // conversation in 'ai' mode so replies still route to the AI.
      try {
        const phoneNumber = toJid.split("@")[0].split(":")[0]
        await saveBroadcastOutboundMessage(agentId, phoneNumber, contactName, personalizedMessage)
      } catch (err: any) {
        logger.warn({ broadcastId, recipientId, err: err?.message }, "Failed to persist broadcast message to inbox")
      }

      // Reset consecutive failure counter on success
      const redis = getRedis()
      await redis.del(`bc:failures:${broadcastId}`)

      logger.info({ broadcastId, recipientId, toJid, sendJid, batchIndex }, "Broadcast message sent")
    } catch (err: any) {
      await updateRecipientStatus(recipientId, "failed", err.message)
      if (!alreadyFailed) await incrementBroadcastFailed(broadcastId)
      void recordEvent({ level: "warn", category: "broadcast.send_failed", agentId, message: err?.message ?? "broadcast send failed", detail: { broadcastId, recipientId, toJid, sendJid } })

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
export async function enqueueBroadcast(broadcastId: string, opts?: {
  scheduledStartAt?: string   // ISO — hold the whole run until this instant
  minSpacingMs?: number       // explicit random spacing (paired with maxSpacingMs)
  maxSpacingMs?: number
}): Promise<void> {
  const broadcast = await getBroadcast(broadcastId)
  if (!broadcast) throw new Error(`Broadcast ${broadcastId} not found`)

  const recipients = await getPendingRecipients(broadcastId)
  if (recipients.length === 0) return

  await updateBroadcastStatus(broadcastId, "running", { startedAt: true })

  // Spread the whole send evenly over the campaign's window (default 24h, min
  // 24h enforced on create), like AI follow-ups. Each message is paced by
  // whichever is LARGER: the natural anti-ban gap, or the even-spacing slot
  // (window ÷ recipients). So a small list still looks human, and a big list is
  // stretched across the full window instead of going out all at once.
  // Small lists may compress the window (or set 0 for "as soon as the anti-ban
  // gap allows"); larger ones keep the 24h floor. Enforced here as well as in
  // routes/broadcasts.ts because this is what actually paces the send, and a
  // campaign row can be created by other paths.
  const clampedHours = resolveSpreadHours(recipients.length, broadcast.spreadHours)
  const windowMs = clampedHours * 60 * 60 * 1000
  const minSpacingMs = Math.floor(windowMs / recipients.length)

  // Optional scheduled start — hold the whole run until this instant (e.g. 6am
  // tomorrow) by offsetting every job's delay. Past/absent = start now.
  const startOffsetMs = opts?.scheduledStartAt
    ? Math.max(0, new Date(opts.scheduledStartAt).getTime() - Date.now())
    : 0
  // Optional explicit random spacing (e.g. 5–10 min) overrides the even-spread
  // pacing: the first message fires at the scheduled start, then each subsequent
  // one is spaced by a random gap in [minSpacingMs, maxSpacingMs].
  const customSpacing = opts?.minSpacingMs != null && opts?.maxSpacingMs != null

  let cumulativeDelayMs = startOffsetMs

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]

    if (customSpacing) {
      if (i > 0) cumulativeDelayMs += truncatedNormal(opts!.minSpacingMs!, opts!.maxSpacingMs!)
    } else {
      // Pace: larger of the natural anti-ban delay and the even-spacing slot.
      const naturalDelay = truncatedNormal(8_000, 20_000)
      cumulativeDelayMs += Math.max(naturalDelay, minSpacingMs)

      // Every 10 messages: add a batch break
      if (i > 0 && i % 10 === 0) {
        const batchBreak = truncatedNormal(60_000, 120_000)
        cumulativeDelayMs += batchBreak
        logger.debug({ broadcastId, index: i, batchBreak }, "Batch break scheduled")
      }
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
