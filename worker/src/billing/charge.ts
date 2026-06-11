import { getAgentBillingInfo, getMonthlyCreditsUsed, insertCreditUsage } from "../db/queries.js"
import { PLAN_CREDIT_LIMITS, allowsOverage } from "./credits.js"
import { routeMessageCharge, deductFromWallet } from "./wallet.js"
import { getBillingPeriod } from "./billing-period.js"

/**
 * Charge an AI send of `credits` to the agent's plan/wallet and record a
 * CreditUsage row. Mirrors the outbound queue's billing routing (plan allowance
 * first, PAYG wallet only when the plan overflows and overage isn't allowed),
 * but for a one-shot charge — used by sends that bypass the per-message queue
 * (e.g. the product album). Throws if the subscription is expired or funds are
 * insufficient, so callers can refuse the send.
 */
export async function chargeAiCredits(opts: {
  agentId: string
  credits: number
  messageType: "text" | "image"
  conversationId?: string
}): Promise<void> {
  const { agentId, credits, messageType, conversationId } = opts
  if (credits <= 0) return

  const billing = await getAgentBillingInfo(agentId)
  if (!billing) throw new Error("Billing profile not found")

  const subscriptionExpired = billing.subscriptionExpiresAt
    ? new Date() > new Date(billing.subscriptionExpiresAt)
    : false
  if (subscriptionExpired) throw new Error("Subscription expired")

  let billedTo: "plan" | "wallet" = "plan"
  const monthlyLimit = PLAN_CREDIT_LIMITS[billing.plan] ?? PLAN_CREDIT_LIMITS.free
  const overageAllowed = allowsOverage(billing.plan)
  if (monthlyLimit !== -1) {
    const { start, end } = getBillingPeriod(billing.subscriptionExpiresAt)
    const used = await getMonthlyCreditsUsed(agentId, start, end)
    const decision = routeMessageCharge({ creditsToCharge: credits, planLimit: monthlyLimit, used, overageAllowed })
    billedTo = decision.billedTo
    if (decision.needsWalletDeduction) {
      const result = await deductFromWallet(billing.userId, credits)
      if (!result.ok) throw new Error("Insufficient credits")
    }
  }

  await insertCreditUsage({ agentId, conversationId, messageType, source: "ai", creditsUsed: credits, billedTo })
}
