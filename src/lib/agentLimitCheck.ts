import { db } from "@/lib/db"
import { PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K, effectiveCreditLimit } from "@/lib/plans"
import { sumCreditsForUser } from "@/lib/creditUsage"
import { getBillingPeriod } from "@/lib/billing-period"
import { getBalance } from "@/lib/creditWallet"

/**
 * Pure decision: should we flip messagingEnabled off?
 *
 * A spendable PAYG wallet (`walletBalance > 0`, expired credits already zeroed by
 * the caller via getBalance) ALWAYS keeps messaging alive — it's paid credit the
 * user is entitled to draw down, even past plan/subscription expiry. Otherwise
 * disable when:
 *   - subscription has expired, OR
 *   - plan allowance is exhausted AND there's no overage entitlement.
 *
 * Extracted as a pure function so the truth table is trivially unit-testable.
 */
export function shouldDisableMessaging(opts: {
  subscriptionExpired: boolean
  planExhausted: boolean
  overageAllowed: boolean
  walletBalance: number
}): boolean {
  if (opts.walletBalance > 0) return false
  if (opts.subscriptionExpired) return true
  if (opts.planExhausted && !opts.overageAllowed) return true
  return false
}

/**
 * Checks whether an agent should be disabled (subscription expired or monthly
 * credits exceeded) and updates the messagingEnabled DB flag accordingly.
 *
 * Does NOT physically unlink the WhatsApp account — the agent stays linked so
 * the pre-call webhook can still fire and return a polite "unavailable" message
 * to customers instead of silent no-response.
 *
 * Physical unlinking is only done by the admin manual toggle
 * (PATCH /api/agents/:id/messaging).
 *
 * Safe to call fire-and-forget — logs errors internally.
 */
export async function checkAndEnforceAgentLimit(agentId: string): Promise<void> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      elevenlabsAgentId: true,
      whatsappPhoneNumberId: true,
      messagingEnabled: true,
      status: true,
      userId: true,
      user: {
        select: {
          plan: true,
          subscriptionExpiresAt: true,
          currentPeriodStart: true,
          carryoverCredits: true,
          carryoverExpiresAt: true,
        },
      },
    },
  })

  // Only enforce on active, fully-configured agents
  if (!agent) return
  if (agent.status !== "ACTIVE") return

  const { plan, subscriptionExpiresAt, currentPeriodStart, carryoverCredits, carryoverExpiresAt } = agent.user
  const overageAllowed = (PLAN_OVERAGE_RATE_PER_1K[plan] ?? null) !== null

  // Check 1: Subscription period expired
  const subscriptionExpired = subscriptionExpiresAt ? new Date() > subscriptionExpiresAt : false

  // Check 2: Monthly credit limit exceeded (includes any still-valid carryover)
  const creditLimit = effectiveCreditLimit(PLAN_CREDIT_LIMITS[plan] ?? 0, carryoverCredits, carryoverExpiresAt)
  let creditsExceeded = false

  if (creditLimit !== -1) {
    const { start: monthStart, end: monthEnd } = getBillingPeriod(subscriptionExpiresAt, currentPeriodStart)

    const used = agent.elevenlabsAgentId
      ? (await db.conversationLog.aggregate({
          where: {
            agentId: agent.id,
            OR: [
              { startTime: { gte: monthStart, lt: monthEnd } },
              { startTime: null, createdAt: { gte: monthStart, lt: monthEnd } },
            ],
          },
          _sum: { creditsUsed: true },
        }))._sum.creditsUsed ?? 0
      : await sumCreditsForUser(agent.userId, monthStart, monthEnd)
    creditsExceeded = used >= creditLimit
    console.log(`[agentLimit] Agent ${agentId}: used=${used}, limit=${creditLimit}, exceeded=${creditsExceeded}`)
  }

  // Wallet check — PAYG credits keep messaging alive after the plan allowance is
  // exhausted OR after the subscription/trial has expired. Fetched only when it
  // could actually rescue (expiry, or plan exhausted without overage), to avoid
  // an extra query on every limit check. getBalance zeroes expired credits.
  let walletBalance = 0
  if (subscriptionExpired || (creditsExceeded && !overageAllowed)) {
    walletBalance = (await getBalance(agent.userId)).creditBalance
  }

  const shouldDisable = shouldDisableMessaging({
    subscriptionExpired,
    planExhausted: creditsExceeded,
    overageAllowed,
    walletBalance,
  })

  if (shouldDisable && agent.messagingEnabled) {
    try {
      await db.agent.update({ where: { id: agentId }, data: { messagingEnabled: false } })
      console.log(`[agentLimit] ❌ Flagged agent ${agentId} as disabled — subscriptionExpired=${subscriptionExpired}, creditsExceeded=${creditsExceeded}, walletBalance=${walletBalance}`)
    } catch (err) {
      console.error(`[agentLimit] Failed to disable agent ${agentId}:`, err)
    }
  } else if (!shouldDisable && !agent.messagingEnabled) {
    try {
      await db.agent.update({ where: { id: agentId }, data: { messagingEnabled: true } })
      console.log(`[agentLimit] ✅ Re-enabled agent ${agentId}`)
    } catch (err) {
      console.error(`[agentLimit] Failed to re-enable agent ${agentId}:`, err)
    }
  }
}

/**
 * Runs the limit check for all active agents belonging to a user.
 * Call this after a plan upgrade or subscription renewal.
 */
export async function checkAndEnforceUserAgentLimits(userId: string): Promise<void> {
  const agents = await db.agent.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  })
  await Promise.all(agents.map((a) => checkAndEnforceAgentLimit(a.id)))
}
