import { db } from "@/lib/db"
import { PLAN_PRICES, PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K, PLAN_LABELS } from "@/lib/plans"
import { getBillingPeriod } from "@/lib/billing-period"
import { sumCreditsForAgents } from "@/lib/creditUsage"
import { checkAndEnforceUserAgentLimits } from "@/lib/agentLimitCheck"
import { chargeAuthorization, newSubscriptionReference, type PaystackAuthorization } from "@/lib/paystack"
import {
  sendSubscriptionActivatedEmail,
  sendSubscriptionRenewedEmail,
  sendSubscriptionCancelledEmail,
} from "@/lib/email"

// Service layer for Paystack recurring subscription billing. Keeps the DB
// transitions, amount math, and side-effects out of the HTTP/cron callers so
// they can be unit-tested against the real DB (no Next.js runtime needed).
// Mirrors the proven creditPurchaseEvents idempotency pattern.

// Dunning policy (see PAYSTACK_SUBSCRIPTION_ANALYSIS.md, decision D2).
export const DUNNING_MAX_ATTEMPTS = 3
export const DUNNING_GRACE_DAYS = 3

// ── Date / reference helpers ────────────────────────────────────────────────

export function addOneMonth(d: Date): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + 1)
  return r
}

/**
 * Where the subscription should expire after a successful charge. Extend from
 * the CURRENT expiry when still in the future (renewing early doesn't lose paid
 * days); otherwise from now. Upgrades pass resetCycle to force now + 1 month.
 */
export function nextExpiry(currentExpiry: Date | null | undefined, now: Date = new Date()): Date {
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now
  return addOneMonth(base)
}

/** Deterministic per-cycle reference → a double cron run / duplicate webhook
 * can never double-charge or double-extend the same renewal. */
export function cycleReference(userId: string, periodStart: Date): string {
  const ymd = periodStart.toISOString().slice(0, 10).replace(/-/g, "")
  return `DZ_SUB_${userId}_${ymd}`
}

// ── Amount (plan + prior-cycle overage) ─────────────────────────────────────

export interface RenewalAmount {
  planNaira: number
  overageNaira: number
  amountNaira: number
}

/**
 * Pure overage charge (Naira) for a cycle. Zero when there's no overage
 * entitlement (rate null), the plan is unlimited (limit < 0), or usage is under
 * the limit. Charged per started 1,000 credits (rounded up), matching the
 * dashboard's accrual display.
 */
export function computeOverageNaira(usedCredits: number, limit: number, ratePer1k: number | null): number {
  if (ratePer1k === null || limit < 0) return 0
  const over = Math.max(0, usedCredits - limit)
  if (over <= 0) return 0
  return Math.ceil(over / 1000) * ratePer1k
}

/**
 * Renewal amount = plan price + prior-cycle overage (starter/pro only).
 * Overage is computed from orchestrator credit usage (CreditUsage) in the
 * window that ends at the user's current expiry. ElevenLabs-voice overage is
 * not auto-billed here (rare for plan subscribers; settle manually if needed).
 */
export async function computeRenewalAmount(userId: string, plan: string): Promise<RenewalAmount> {
  const planNaira = PLAN_PRICES[plan] ?? 0
  const rate = PLAN_OVERAGE_RATE_PER_1K[plan] // null = no overage entitlement
  const limit = PLAN_CREDIT_LIMITS[plan] ?? 0

  let overage = 0
  if (rate !== null && limit !== -1) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { subscriptionExpiresAt: true },
    })
    const { start, end } = getBillingPeriod(user?.subscriptionExpiresAt ?? null)
    const agents = await db.agent.findMany({
      where: { userId, status: "ACTIVE" },
      select: { id: true },
    })
    const used = await sumCreditsForAgents(agents.map((a) => a.id), start, end)
    overage = computeOverageNaira(used, limit, rate)
  }

  return { planNaira, overageNaira: overage, amountNaira: planNaira + overage }
}

// ── Apply a successful charge (idempotent) ──────────────────────────────────

export type ApplySubOutcome =
  | { result: "activated"; plan: string }
  | { result: "already_processed" }
  | { result: "unknown_reference" }
  | { result: "non_pending_skipped"; status: string }
  | { result: "race_lost" }

/**
 * Apply a successful subscription charge idempotently — called from BOTH the
 * webhook and the synchronous charge_authorization response. Transition the
 * SubscriptionCharge row first (idempotency anchor), then activate the user.
 */
export async function applySubscriptionCharge(args: {
  reference: string
  authorization?: PaystackAuthorization
  customerCode?: string
  actualFeeNaira?: number
  /** Upgrades reset the cycle to now+1mo; renewals/initial extend from current expiry. */
  resetCycle?: boolean
}): Promise<ApplySubOutcome> {
  const charge = await db.subscriptionCharge.findUnique({
    where: { reference: args.reference },
    select: {
      id: true, userId: true, status: true, plan: true, amountNaira: true, kind: true,
      user: { select: { name: true, email: true, subscriptionExpiresAt: true } },
    },
  })

  if (!charge) return { result: "unknown_reference" }
  if (charge.status === "PAID") return { result: "already_processed" }
  if (charge.status !== "PENDING") return { result: "non_pending_skipped", status: charge.status }

  const actualNet =
    typeof args.actualFeeNaira === "number"
      ? Math.max(0, charge.amountNaira - Math.round(args.actualFeeNaira))
      : undefined

  // Atomic conditional transition — count===0 means another delivery won the race.
  const transition = await db.subscriptionCharge.updateMany({
    where: { reference: args.reference, status: "PENDING" },
    data: {
      status: "PAID",
      completedAt: new Date(),
      ...(actualNet !== undefined ? { netNaira: actualNet } : {}),
    },
  })
  if (transition.count === 0) return { result: "race_lost" }

  const newExpiry = args.resetCycle
    ? addOneMonth(new Date())
    : nextExpiry(charge.user.subscriptionExpiresAt)

  const auth = args.authorization
  const cardExpiry =
    auth?.exp_month && auth?.exp_year ? `${auth.exp_month}/${auth.exp_year.slice(-2)}` : undefined

  await db.user.update({
    where: { id: charge.userId },
    data: {
      plan: charge.plan,
      subscriptionExpiresAt: newExpiry,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      pendingPlan: null, // any scheduled downgrade is now applied (charge.plan)
      renewalRetryCount: 0,
      lastRenewalAttemptAt: new Date(),
      paymentFailedEmailSentAt: null,
      expiryWarningEmailSentAt: null,
      expiredEmailSentAt: null,
      ...(auth?.authorization_code
        ? {
            paystackAuthorizationCode: auth.authorization_code,
            authorizationReusable: auth.reusable ?? true,
            autoRenew: auth.reusable ?? true,
            ...(auth.last4 ? { cardLast4: auth.last4 } : {}),
            ...(auth.brand || auth.card_type ? { cardBrand: auth.brand ?? auth.card_type } : {}),
            ...(cardExpiry ? { cardExpiry } : {}),
          }
        : {}),
      ...(args.customerCode ? { paystackCustomerCode: args.customerCode } : {}),
    },
  })

  // Re-enable agents now that the plan is active/renewed.
  try {
    await checkAndEnforceUserAgentLimits(charge.userId)
  } catch (err) {
    console.error("[sub] re-enable agents failed", { reference: args.reference, err: String(err) })
  }

  // Receipt email — best-effort, never blocks the webhook/cron.
  try {
    const planLabel = PLAN_LABELS[charge.plan] ?? charge.plan
    const payload = {
      name: charge.user.name,
      email: charge.user.email,
      planLabel,
      amountNaira: charge.amountNaira,
      reference: args.reference,
      nextChargeAt: newExpiry,
    }
    if (charge.kind === "renewal") await sendSubscriptionRenewedEmail(payload)
    else await sendSubscriptionActivatedEmail(payload)
  } catch (err) {
    console.warn("[sub] receipt email failed (non-fatal)", { reference: args.reference, err: String(err) })
  }

  return { result: "activated", plan: charge.plan }
}

/** Mark a PENDING charge FAILED (declined card). No-op if it isn't PENDING. */
export async function markSubscriptionChargeFailed(reference: string, reason: string): Promise<void> {
  await db.subscriptionCharge.updateMany({
    where: { reference, status: "PENDING" },
    data: { status: "FAILED", failureReason: reason.slice(0, 300) },
  })
}

// ── Renewal (cron) ──────────────────────────────────────────────────────────

export interface RenewableUser {
  id: string
  email: string
  plan: string
  subscriptionExpiresAt: Date | null
  paystackAuthorizationCode: string | null
  authorizationReusable: boolean
  pendingPlan: string | null
}

export type RenewalOutcome =
  | { result: "renewed" }
  | { result: "charge_failed"; reason: string }
  | { result: "no_authorization" }
  | { result: "skipped"; reason: string }

/**
 * Charge a saved card for the next cycle. Idempotent via the deterministic
 * per-cycle reference. Applies a scheduled downgrade (pendingPlan) by charging
 * that plan's price. Caller (cron) owns retry/grace bookkeeping.
 */
export async function chargeRenewal(user: RenewableUser): Promise<RenewalOutcome> {
  if (!user.paystackAuthorizationCode || !user.authorizationReusable) {
    return { result: "no_authorization" }
  }

  const planToCharge = user.pendingPlan ?? user.plan
  const planNaira = PLAN_PRICES[planToCharge] ?? 0
  if (planNaira <= 0) return { result: "skipped", reason: "non-billable plan" }

  // Overage accrued on the EXPIRING plan (post-paid at renewal).
  const { overageNaira } = await computeRenewalAmount(user.id, user.plan)
  const amountNaira = planNaira + overageNaira
  const periodStart = user.subscriptionExpiresAt ?? new Date()
  const periodEnd = addOneMonth(periodStart)

  // Fresh reference per ATTEMPT — Paystack rejects a reused reference, so a
  // dunning retry can't reuse the prior failed attempt's ref. Cycle-level
  // idempotency (don't renew the same cycle twice) is the cron's job: it only
  // calls this when the subscription is actually due, and a same-day guard
  // stops a second attempt. Once a charge succeeds, expiry moves forward so the
  // user is no longer "due" and won't be charged again.
  const reference = newSubscriptionReference()
  await db.subscriptionCharge.create({
    data: {
      userId: user.id, plan: planToCharge, reference, kind: "renewal",
      planNaira, overageNaira, amountNaira, netNaira: amountNaira,
      status: "PENDING", periodStart, periodEnd,
    },
  })

  await db.user.update({ where: { id: user.id }, data: { lastRenewalAttemptAt: new Date() } })

  const res = await chargeAuthorization({
    authorizationCode: user.paystackAuthorizationCode,
    email: user.email,
    amountKobo: amountNaira * 100,
    reference,
    metadata: { purpose: "subscription", userId: user.id, plan: planToCharge, kind: "renewal" },
  })

  if (res.status === "success") {
    await applySubscriptionCharge({
      reference,
      actualFeeNaira: typeof res.feesKobo === "number" ? res.feesKobo / 100 : undefined,
    })
    return { result: "renewed" }
  }

  await markSubscriptionChargeFailed(reference, res.gatewayResponse ?? "charge declined")
  return { result: "charge_failed", reason: res.gatewayResponse ?? "charge declined" }
}

/**
 * Immediate upgrade with the saved card — charges the FULL new-plan price and
 * resets the cycle to now + 1 month (decision D1). Caller must confirm the user
 * has a reusable authorization; otherwise route them through hosted checkout.
 */
export async function chargeUpgradeNow(user: RenewableUser, newPlan: string): Promise<RenewalOutcome> {
  if (!user.paystackAuthorizationCode || !user.authorizationReusable) {
    return { result: "no_authorization" }
  }
  const planNaira = PLAN_PRICES[newPlan] ?? 0
  if (planNaira <= 0) return { result: "skipped", reason: "non-billable plan" }

  const periodStart = new Date()
  const periodEnd = addOneMonth(periodStart)
  const reference = newSubscriptionReference()

  await db.subscriptionCharge.create({
    data: {
      userId: user.id, plan: newPlan, reference, kind: "upgrade",
      planNaira, overageNaira: 0, amountNaira: planNaira, netNaira: planNaira,
      status: "PENDING", periodStart, periodEnd,
    },
  })

  const res = await chargeAuthorization({
    authorizationCode: user.paystackAuthorizationCode,
    email: user.email,
    amountKobo: planNaira * 100,
    reference,
    metadata: { purpose: "subscription", userId: user.id, plan: newPlan, kind: "upgrade" },
  })

  if (res.status === "success") {
    await applySubscriptionCharge({
      reference,
      resetCycle: true,
      actualFeeNaira: typeof res.feesKobo === "number" ? res.feesKobo / 100 : undefined,
    })
    return { result: "renewed" }
  }

  await markSubscriptionChargeFailed(reference, res.gatewayResponse ?? "charge declined")
  return { result: "charge_failed", reason: res.gatewayResponse ?? "charge declined" }
}

// ── Lifecycle (cancel / downgrade) ──────────────────────────────────────────

/** Turn off auto-renew. Access continues until subscriptionExpiresAt, then the
 * renewal cron downgrades to Free. */
export async function cancelSubscription(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, plan: true, subscriptionExpiresAt: true },
  })
  await db.user.update({
    where: { id: userId },
    data: { autoRenew: false, cancelAtPeriodEnd: true, subscriptionStatus: "cancelled" },
  })
  try {
    if (user?.subscriptionExpiresAt) {
      await sendSubscriptionCancelledEmail({
        name: user.name,
        email: user.email,
        planLabel: PLAN_LABELS[user.plan] ?? user.plan,
        accessUntil: user.subscriptionExpiresAt,
      })
    }
  } catch (err) {
    console.warn("[sub] cancel email failed (non-fatal)", String(err))
  }
}

/** Schedule a downgrade to a lower paid plan — applied (and charged) at the
 * next renewal so the user keeps the higher tier until period end. */
export async function scheduleDowngrade(userId: string, plan: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { pendingPlan: plan } })
}

/** Move the account to Free — after dunning grace runs out, or when a cancelled
 * subscription reaches its period end. */
export async function downgradeToFree(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      plan: "free",
      // Land on the "choose a plan" wall, not free-forever: a lapsed paying
      // customer should re-subscribe rather than fall back to an open free tier.
      // (Past timestamp = trial already expired.)
      subscriptionExpiresAt: new Date(Date.now() - 1000),
      subscriptionStatus: "none",
      autoRenew: false,
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      renewalRetryCount: 0,
    },
  })
  try {
    await checkAndEnforceUserAgentLimits(userId)
  } catch (err) {
    console.error("[sub] downgrade re-enable failed", String(err))
  }
}
