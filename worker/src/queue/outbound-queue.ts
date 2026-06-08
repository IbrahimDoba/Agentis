import { Queue, Worker, type Job } from "bullmq"
import { randomUUID } from "crypto"
import { getRedis } from "./redis.js"
import { sessionManager } from "../baileys/session-manager.js"
import { sendWithPacing, sendImageWithPacing, businessHoursCheck } from "../anti-ban/pacing.js"
import {
  checkAndIncrement,
  trackNewContact,
} from "../anti-ban/rate-limiter.js"
import {
  recordSendError,
  recordAckSuccess,
  recordAckFailure,
} from "../anti-ban/throttle-detector.js"
import {
  getSessionByAgentId,
  logOutbound,
  markOutboundSent,
  getAgentBillingInfo,
  getMonthlyCreditsUsed,
  insertCreditUsage,
} from "../db/queries.js"
import { webhookEmitter } from "../dashboard/webhook-emitter.js"
import { logger as rootLogger } from "../lib/logger.js"
import { RateLimitError } from "../lib/errors.js"
import { PLAN_CREDIT_LIMITS, creditsForMessageType, creditsForTokens, allowsOverage } from "../billing/credits.js"
import { routeMessageCharge, deductFromWallet } from "../billing/wallet.js"
import { getBillingPeriod } from "../billing/billing-period.js"

const logger = rootLogger.child({ module: "outbound-queue" })
const QUEUE_NAME = "outbound-messages"

export interface OutboundJob {
  agentId: string
  toJid: string
  text: string
  mediaUrl?: string
  type?: "text" | "image"
  conversationId?: string
  // "api" = developer-initiated outbound via the public API. Billed like "ai"
  // (flat per-message), counts toward warmup/anti-ban like any non-human send.
  source: "ai" | "human" | "api"
  // PAYG: real OpenAI token counts from the orchestrator's chat completion.
  // Only carried on the FIRST part of a split reply; subsequent parts pass 0
  // so we don't double-charge the same LLM turn. When absent (broadcasts,
  // follow-ups, anything non-orchestrator), we fall back to the flat per-type
  // rate via creditsForMessageType().
  tokensInput?: number
  tokensOutput?: number
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
    const { agentId, toJid, text, mediaUrl, type, conversationId, source, tokensInput, tokensOutput } = job.data

    // §7.8 — Phone online check
    const sock = sessionManager.get(agentId)
    if (!sock) throw new Error(`No active session for agent ${agentId}`)

    // §7.5 — Check if paused
    if (sessionManager.isPaused(agentId)) throw new Error(`Session ${agentId} is paused (anti-ban)`)

    // Get session for tier and business hours
    const session = await getSessionByAgentId(agentId)
    if (!session) throw new Error(`Session record not found for agent ${agentId}`)

    // §7.6 — Business hours check (AI replies still go through, just with extra delay)
    // T4 numbers are fully warmed up — skip the off-hours penalty so they respond
    // in real time around the clock. T1–T3 still get the delay for anti-ban safety.
    const { extraDelayMs } = businessHoursCheck(
      session.businessHoursStart,
      session.businessHoursEnd,
      session.timezone
    )
    if (extraDelayMs > 0 && session.warmupTier < 4) {
      logger.debug({ agentId, extraDelayMs, tier: session.warmupTier }, "Outside business hours — adding extra delay")
      await new Promise((r) => setTimeout(r, extraDelayMs))
    }

    // Rate limiting (human messages bypass — operator-initiated sends should never be blocked)
    if (source !== "human") {
      await checkAndIncrement(agentId, session.warmupTier)
      await trackNewContact(agentId, toJid)
    }

    // Billing guardrails (AI sends only — human operator messages always go through)
    const messageType: "text" | "image" = type === "image" ? "image" : "text"
    // Token-weighted when the orchestrator passed real OpenAI token counts;
    // otherwise fall back to the legacy flat per-type rate (broadcasts,
    // follow-ups, any non-orchestrator AI path that doesn't know tokens).
    const hasTokens = typeof tokensInput === "number" && typeof tokensOutput === "number" &&
      (tokensInput > 0 || tokensOutput > 0)
    const creditsToCharge = hasTokens
      ? creditsForTokens(tokensInput!, tokensOutput!)
      : creditsForMessageType(messageType)
    let billedTo: "plan" | "wallet" = "plan"
    if (source === "ai" || source === "api") {
      const billing = await getAgentBillingInfo(agentId)
      if (!billing) throw new RateLimitError("Billing profile not found")

      const subscriptionExpired = billing.subscriptionExpiresAt
        ? new Date() > new Date(billing.subscriptionExpiresAt)
        : false
      if (subscriptionExpired) {
        throw new RateLimitError("Subscription expired")
      }

      const monthlyLimit = PLAN_CREDIT_LIMITS[billing.plan] ?? PLAN_CREDIT_LIMITS.free
      const overageAllowed = allowsOverage(billing.plan)
      if (monthlyLimit !== -1) {
        const { start: monthStart, end: monthEnd } = getBillingPeriod(billing.subscriptionExpiresAt)
        const used = await getMonthlyCreditsUsed(agentId, monthStart, monthEnd)
        // Decide whether this charge lands on the plan allowance or the PAYG
        // wallet. Wallet draws happen ONLY when the plan would overflow and
        // overage isn't allowed (Free/Basic). The decision is pure — see
        // routeMessageCharge tests for the truth table.
        const decision = routeMessageCharge({
          creditsToCharge,
          planLimit: monthlyLimit,
          used,
          overageAllowed,
        })
        billedTo = decision.billedTo
        if (decision.needsWalletDeduction) {
          const result = await deductFromWallet(billing.userId, creditsToCharge)
          if (!result.ok) {
            throw new RateLimitError(
              `Plan credits exhausted (${used}/${monthlyLimit}) and wallet has insufficient balance`
            )
          }
        }
      }
    }

    // Log to DB
    const logEntry = await logOutboundEntry({ session, toJid, text, conversationId })
    const startMs = Date.now()

    try {
      // sendWithPacing / sendImageWithPacing register the msgId in the dedup
      // cache internally — immediately after the send returns, before the
      // post-send pacing delay — so we don't race the WhatsApp fromMe
      // reflection arriving back at our event handler.
      if (type === "image" && mediaUrl) {
        await sendImageWithPacing(sock, toJid, mediaUrl, text, session.warmupTier)
      } else {
        await sendWithPacing(sock, toJid, text, session.warmupTier)
      }

      // Only AI sends consume credits. Human operator replies — whether sent
      // from the dashboard or the operator's own phone — are free. The user's
      // value is "AI handles customer conversations"; charging when they take
      // over to rescue a tricky conversation discourages exactly the behavior
      // we want them to do.
      if (source === "ai" || source === "api") {
        await insertCreditUsage({
          agentId,
          conversationId,
          messageType,
          source,
          creditsUsed: creditsToCharge,
          // PAYG audit columns — let the support UI reconstruct WHY a given
          // message cost what it cost (token counts) and WHERE it billed to.
          tokensInput: hasTokens ? tokensInput : null,
          tokensOutput: hasTokens ? tokensOutput : null,
          billedTo,
        })
      }

      const delayAppliedMs = Date.now() - startMs
      if (logEntry) await markOutboundSent(logEntry, delayAppliedMs)

      recordAckSuccess(agentId)
      webhookEmitter.emit("message.sent", { agentId, toJid, conversationId })
    } catch (err) {
      // Only count as throttle signal if it's not a connection-level error
      const msg = String(err)
      const isConnectionError = msg.includes("Connection Closed") || msg.includes("ECONNRESET") || msg.includes("socket hang up") || msg.includes("Stream Errored")
      if (!isConnectionError) {
        recordSendError(agentId)
      }
      webhookEmitter.emit("message.failed", { agentId, toJid, conversationId, error: msg })
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
