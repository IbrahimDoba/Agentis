import { db } from "@/lib/db"
import { mapWithConcurrency } from "@/lib/concurrency"
import { emailBrandOf } from "@/lib/tenant"
import { getBillingPeriod } from "@/lib/billing-period"
import { PLAN_CREDIT_LIMITS, AI_CREDIT_COSTS } from "@/lib/plans"
import { sendCreditHalfwayEmail, sendCreditNearCapEmail, type EmailBrand } from "@/lib/email"

// Thresholds as FRACTIONS of the plan allowance, not absolute credits: the free
// allowance has moved before, and 500/900 hardcoded would quietly become the
// wrong nudges the next time it does.
// Only accounts that signed up on or after launch get these. Existing free
// users were never told to expect upgrade emails, so the nudges are scoped to
// people who join knowing the free plan works this way.
export const NUDGES_ELIGIBLE_FROM = new Date("2026-10-03T00:00:00Z")

export const HALF_AT = 0.5
export const NEAR_CAP_AT = 0.9

export type NudgeStage = "near-cap" | "half" | null

/**
 * Which nudge (if any) is due. Pure so the threshold and staleness rules can be
 * tested without a database.
 *
 * A stamp from BEFORE the current period start is stale — that nudge belongs to
 * a finished cycle, so it re-arms. This is what removes the need for a reset job.
 * Near-cap wins when both qualify: an account that crosses 50% and 90% between
 * two runs should hear the urgent one, not the gentle one.
 */
export function selectNudgeStage(args: {
  used: number
  limit: number
  periodStart: Date
  halfNotifiedAt: Date | null
  nearCapNotifiedAt: Date | null
}): NudgeStage {
  const { used, limit, periodStart, halfNotifiedAt, nearCapNotifiedAt } = args
  if (limit <= 0) return null
  const sentThisCycle = (at: Date | null) => at != null && at >= periodStart
  if (used >= limit * NEAR_CAP_AT && !sentThisCycle(nearCapNotifiedAt)) return "near-cap"
  if (used >= limit * HALF_AT && !sentThisCycle(halfNotifiedAt)) return "half"
  return null
}

/** Roughly how many more AI text replies the remaining allowance buys. */
export function repliesRemaining(used: number, limit: number): number {
  return Math.max(0, Math.floor((limit - used) / AI_CREDIT_COSTS.text))
}

const EMAIL_CONCURRENCY = 5
// Cap per run so a config mistake can't fan out to the whole free base at once.
const MAX_PER_RUN = 200

export interface CreditNudgeSummary {
  halfwaySent: number
  nearCapSent: number
  errors: Array<{ userId: string; kind: "half" | "near-cap"; message: string }>
}

/**
 * Email free-plan accounts as they burn through the cycle's allowance — once at
 * ~50% and once at ~90%.
 *
 * Idempotency without a reset job: each nudge stores a timestamp, and a stamp
 * that predates the CURRENT period start counts as stale. So the nudges re-arm
 * by themselves every renewal, and nothing has to remember to clear them.
 *
 * Runs on a schedule rather than inside the credit-charge path: charging happens
 * per message in the worker's hot path, and two concurrent sends crossing the
 * threshold together would both fire the email.
 */
export async function runCreditNudges(now: Date = new Date()): Promise<CreditNudgeSummary> {
  const summary: CreditNudgeSummary = { halfwaySent: 0, nearCapSent: 0, errors: [] }

  const limit = PLAN_CREDIT_LIMITS.free
  if (!limit || limit < 0) return summary // unlimited/!configured — nothing to warn about

  const users = await db.user.findMany({
    where: { plan: "free", status: "APPROVED", createdAt: { gte: NUDGES_ELIGIBLE_FROM } },
    select: {
      id: true, name: true, email: true, resellerId: true,
      subscriptionExpiresAt: true, currentPeriodStart: true,
      creditHalfNotifiedAt: true, creditNearCapNotifiedAt: true,
      agents: { select: { id: true } },
    },
    take: MAX_PER_RUN,
  })
  if (users.length === 0) return summary

  const resellers = await db.reseller.findMany({
    where: { id: { in: [...new Set(users.map((u) => u.resellerId))] } },
  })
  const brandById = new Map(resellers.map((r) => [r.id, r]))
  const brandFor = (id: string): EmailBrand | undefined => emailBrandOf(brandById.get(id) ?? null)

  await mapWithConcurrency(users, EMAIL_CONCURRENCY, async (user) => {
    const agentIds = user.agents.map((a) => a.id)
    if (agentIds.length === 0) return

    const { start, end } = getBillingPeriod(user.subscriptionExpiresAt, user.currentPeriodStart)

    const usedAgg = await db.creditUsage.aggregate({
      _sum: { creditsUsed: true },
      where: { agentId: { in: agentIds }, createdAt: { gte: start, lt: end } },
    })
    const used = usedAgg._sum.creditsUsed ?? 0

    const stage = selectNudgeStage({
      used, limit, periodStart: start,
      halfNotifiedAt: user.creditHalfNotifiedAt,
      nearCapNotifiedAt: user.creditNearCapNotifiedAt,
    })
    if (!stage) return

    // Their own numbers for this cycle — "here is what stops" argues better than
    // "you are running low", and these are the figures that make it concrete.
    const [conversations, leads] = await Promise.all([
      db.conversation.count({ where: { agentId: { in: agentIds }, createdAt: { gte: start, lt: end } } }),
      db.lead.count({ where: { agentId: { in: agentIds }, createdAt: { gte: start, lt: end } } }),
    ])

    // Claim BEFORE sending, guarded on the stamp we read, so two overlapping
    // runs can't both email the same user. 0 rows touched = the other run won.
    const field = stage === "near-cap" ? "creditNearCapNotifiedAt" : "creditHalfNotifiedAt"
    const claim = await db.user.updateMany({
      where: { id: user.id, [field]: stage === "near-cap" ? user.creditNearCapNotifiedAt : user.creditHalfNotifiedAt },
      data: { [field]: now },
    })
    if (claim.count === 0) return

    try {
      if (stage === "near-cap") {
        await sendCreditNearCapEmail({
          ownerName: user.name, email: user.email, used, limit,
          repliesLeft: repliesRemaining(used, limit),
          conversations, leads,
        }, brandFor(user.resellerId))
        summary.nearCapSent++
      } else {
        await sendCreditHalfwayEmail({
          ownerName: user.name, email: user.email, used, limit, conversations, leads,
        }, brandFor(user.resellerId))
        summary.halfwaySent++
      }
    } catch (err) {
      // The stamp is already set, so this one won't retry — record it so a
      // Resend outage is visible rather than silently swallowing a nudge.
      console.error("[credit-nudges] send failed", { userId: user.id, stage }, err)
      summary.errors.push({
        userId: user.id,
        kind: stage === "near-cap" ? "near-cap" : "half",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return summary
}
