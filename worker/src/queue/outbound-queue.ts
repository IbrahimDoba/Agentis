import { Queue, Worker, type Job } from "bullmq"
import { randomUUID } from "crypto"
import { getRedis } from "./redis.js"
import { sessionManager } from "../baileys/session-manager.js"
import { sendWithPacing, businessHoursCheck } from "../anti-ban/pacing.js"
import {
  checkAndIncrement,
  checkDuplicateText,
  trackNewContact,
} from "../anti-ban/rate-limiter.js"
import {
  recordSendError,
  recordAckSuccess,
  recordAckFailure,
} from "../anti-ban/throttle-detector.js"
import { getSessionByAgentId, logOutbound, markOutboundSent } from "../db/queries.js"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { logger as rootLogger } from "../lib/logger.js"
import { RateLimitError } from "../lib/errors.js"

const logger = rootLogger.child({ module: "outbound-queue" })
const QUEUE_NAME = "outbound-messages"

export interface OutboundJob {
  agentId: string
  toJid: string
  text: string
  conversationId?: string
  source: "ai" | "human"
}

const queue = new Queue<OutboundJob>(QUEUE_NAME, {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})

const worker = new Worker<OutboundJob>(
  QUEUE_NAME,
  async (job: Job<OutboundJob>) => {
    const { agentId, toJid, text, conversationId, source } = job.data

    // §7.8 — Phone online check
    const sock = sessionManager.get(agentId)
    if (!sock) throw new Error(`No active session for agent ${agentId}`)

    // §7.5 — Check if paused
    if (sessionManager.isPaused(agentId)) throw new Error(`Session ${agentId} is paused (anti-ban)`)

    // Get session for tier and business hours
    const session = await getSessionByAgentId(agentId)
    if (!session) throw new Error(`Session record not found for agent ${agentId}`)

    // §7.6 — Business hours check (AI replies still go through, just with extra delay)
    const { extraDelayMs } = businessHoursCheck(
      session.businessHoursStart,
      session.businessHoursEnd,
      session.timezone
    )
    if (extraDelayMs > 0) {
      logger.debug({ agentId, extraDelayMs }, "Outside business hours — adding extra delay")
      await new Promise((r) => setTimeout(r, extraDelayMs))
    }

    // §7.4 — Duplicate text check (AI messages only — human messages bypass)
    if (source === "ai") {
      await checkDuplicateText(text, toJid)
    }

    // Rate limiting
    await checkAndIncrement(agentId, session.warmupTier)
    await trackNewContact(agentId, toJid)

    // Log to DB
    const logEntry = await logOutboundEntry({ session, toJid, text, conversationId })
    const startMs = Date.now()

    try {
      await sendWithPacing(sock, toJid, text, session.warmupTier)

      const delayAppliedMs = Date.now() - startMs
      if (logEntry) await markOutboundSent(logEntry, delayAppliedMs)

      recordAckSuccess(agentId)
      webhookEmitter.emit("message.sent", { agentId, toJid, conversationId })
    } catch (err) {
      recordSendError(agentId)
      webhookEmitter.emit("message.failed", { agentId, toJid, conversationId, error: String(err) })
      throw err
    }
  },
  {
    connection: getRedis(),
    concurrency: 1, // one message at a time per worker instance
  }
)

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "Outbound job failed")
})

// Drain stale jobs from previous worker runs on startup
;(async () => {
  try {
    const stale = await queue.getJobs(["failed", "delayed", "waiting"], 0, 50)
    let cleaned = 0
    for (const job of stale) {
      if (job && Date.now() - job.timestamp > 60_000) {
        await job.remove().catch(() => {})
        cleaned++
      }
    }
    if (cleaned > 0) logger.info({ cleaned }, "Cleaned stale BullMQ jobs on startup")
  } catch (err) {
    logger.warn({ err }, "Failed to clean stale BullMQ jobs")
  }
})()

async function logOutboundEntry(opts: {
  session: { id: string }
  toJid: string
  text: string
  conversationId?: string
}): Promise<string | null> {
  try {
    const { sql } = await import("../db/client.js")
    const id = randomUUID()
    const rows = await sql<{ id: string }[]>`
      INSERT INTO "BaileysOutboundLog"
        ("id", "sessionId", "toJid", "messagePreview", "conversationId", "status")
      VALUES (
        ${id}, ${opts.session.id}, ${opts.toJid}, ${opts.text.slice(0, 80)},
        ${opts.conversationId ?? null}, 'QUEUED'
      )
      RETURNING "id"
    `
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

export const outboundQueue = {
  async enqueue(job: OutboundJob): Promise<{ id: string | undefined } | null> {
    try {
      const added = await queue.add("send", job, {
        priority: job.source === "human" ? 1 : 5, // human messages are higher priority
      })
      return { id: added.id }
    } catch (err) {
      if (err instanceof RateLimitError) return null
      throw err
    }
  },

  async getQueueDepth(): Promise<number> {
    return queue.count()
  },
}
