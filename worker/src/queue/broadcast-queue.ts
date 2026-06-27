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
  getRecipient,
} from "../db/queries/broadcasts.js"
import { RateLimitError } from "../lib/errors.js"
import { truncatedNormal } from "../anti-ban/distribution.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "broadcast-queue" })
const QUEUE_NAME = "broadcast-send"

// Consecutive failure threshold before auto-pausing
const MAX_CONSECUTIVE_FAILURES = 3

// Resolve the JID we should actually send to. WhatsApp increasingly addresses
// contacts by privacy LID (@lid). Sending to the phone JID (@s.whatsapp.net)
// for a LID-migrated contact SILENTLY FAILS — sendMessage returns an id (so we
// mark it "sent") but nothing is delivered. That's the "says 96 sent, none
// arrive" symptom. AI replies work because they reply to the inbound message's
// LID directly; broadcasts constructed a phone JID instead. So here we resolve
// the contact's LID and send to THAT. Returns null when the number isn't on
// WhatsApp at all.
async function resolveSendJid(
  sock: ReturnType<typeof sessionManager.get>,
  toJid: string
): Promise<string | null> {
  if (!sock) return null
  // Already LID-addressed — send as-is.
  if (toJid.endsWith("@lid")) return toJid

  // Prefer the contact's LID. getLIDForPN resolves from the local mapping or
  // fetches it from WhatsApp (USync) when unknown, so it works for existing
  // contacts — not just ones who've messaged since this deployed.
  try {
    const lidStore = (sock as unknown as {
      signalRepository?: { lidMapping?: { getLIDForPN?: (pn: string) => Promise<string | null> } }
    }).signalRepository?.lidMapping
    const lid = await lidStore?.getLIDForPN?.(toJid)
    if (lid && lid.endsWith("@lid")) return lid
  } catch {
    // fall through to phone-JID verification
  }

  // Not LID-migrated (or mapping unavailable) — verify the number is on
  // WhatsApp and send to the phone JID.
  try {
    const checks = (await sock.onWhatsApp(toJid)) ?? []
    const match = checks.find((item) => item?.exists)
    return match ? (match.jid || toJid) : null
  } catch {
    return null
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

    // Personalize message — replace {name} with contact name if available
    const personalizedMessage = contactName
      ? message.replace(/\{name\}/gi, contactName.split(" ")[0])
      : message.replace(/\{name\},?\s*/gi, "")

    try {
      await sendWithPacing(sock, sendJid, personalizedMessage, session.warmupTier)
      await updateRecipientStatus(recipientId, "sent")
      await incrementBroadcastSent(broadcastId)

      // Reset consecutive failure counter on success
      const redis = getRedis()
      await redis.del(`bc:failures:${broadcastId}`)

      logger.info({ broadcastId, recipientId, toJid, sendJid, batchIndex }, "Broadcast message sent")
    } catch (err: any) {
      await updateRecipientStatus(recipientId, "failed", err.message)
      if (!alreadyFailed) await incrementBroadcastFailed(broadcastId)

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
