import { getAgentBillingInfo, getMonthlyCreditsUsedForUser, insertCreditUsage } from "../db/queries.js"
import { PLAN_CREDIT_LIMITS, effectiveCreditLimit, allowsOverage, creditsForTokens, creditsForMessageType } from "./credits.js"
import { routeMessageCharge, deductFromWallet, getWalletBalance } from "./wallet.js"
import { getBillingPeriod } from "./billing-period.js"

/**
 * Cheap pre-check: does this agent's account have ANY credit headroom for an AI
 * reply right now? Mirrors the send-time gate's routing (see chargeAiCredits and
 * the outbound queue) but WITHOUT a specific cost — it answers "can we afford to
 * generate + send at all", so the orchestrator can skip the LLM call entirely
 * when the account is out of funds (no wasted tokens, no undelivered reply row).
 *
 * Conservative by design: returns false ONLY when the account definitively can't
 * pay, so it never blocks a reply the send-gate would have allowed.
 */
export async function hasCreditHeadroom(agentId: string): Promise<boolean> {
  const billing = await getAgentBillingInfo(agentId)
  if (!billing) return false // no billing profile → the send-gate blocks too

  const wallet = await getWalletBalance(billing.userId)

  const subscriptionExpired = billing.subscriptionExpiresAt
    ? new Date() > new Date(billing.subscriptionExpiresAt)
    : false
  if (subscriptionExpired) return wallet > 0 // plan void — only the wallet can pay

  const monthlyLimit = effectiveCreditLimit(
    PLAN_CREDIT_LIMITS[billing.plan] ?? PLAN_CREDIT_LIMITS.free,
    billing.carryoverCredits,
    billing.carryoverExpiresAt
  )
  if (monthlyLimit === -1) return true // enterprise — unlimited

  const { start, end } = getBillingPeriod(billing.subscriptionExpiresAt)
  const used = await getMonthlyCreditsUsedForUser(billing.userId, start, end)
  if (used < monthlyLimit) return true // plan allowance still has room
  return wallet > 0 // plan exhausted → the wallet must cover the overflow
}

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
  // What produced the charge, for CreditUsage accounting. Defaults to "ai"
  // (the AI reply path). Bulk sends pass "broadcast" (plain broadcast) or
  // "followup" (personalized AI follow-up) so marketing spend is reportable
  // separately from conversational AI spend.
  source?: "ai" | "broadcast" | "followup"
}): Promise<void> {
  const { agentId, credits, messageType, conversationId } = opts
  const source = opts.source ?? "ai"
  if (credits <= 0) return

  const billing = await getAgentBillingInfo(agentId)
  if (!billing) throw new Error("Billing profile not found")

  const subscriptionExpired = billing.subscriptionExpiresAt
    ? new Date() > new Date(billing.subscriptionExpiresAt)
    : false

  // Plan/trial lapsed → the plan allowance is void; only the PAYG wallet can fund
  // the send. deductFromWallet is atomic and refuses expired/insufficient wallets,
  // so a usable wallet keeps the agent sending and anything else still blocks.
  if (subscriptionExpired) {
    const result = await deductFromWallet(billing.userId, credits)
    if (!result.ok) throw new Error("Subscription expired")
    await insertCreditUsage({ agentId, conversationId, messageType, source, creditsUsed: credits, billedTo: "wallet" })
    return
  }

  let billedTo: "plan" | "wallet" = "plan"
  const monthlyLimit = effectiveCreditLimit(PLAN_CREDIT_LIMITS[billing.plan] ?? PLAN_CREDIT_LIMITS.free, billing.carryoverCredits, billing.carryoverExpiresAt)
  const overageAllowed = allowsOverage(billing.plan)
  if (monthlyLimit !== -1) {
    const { start, end } = getBillingPeriod(billing.subscriptionExpiresAt)
    const used = await getMonthlyCreditsUsedForUser(billing.userId, start, end)
    const decision = routeMessageCharge({ creditsToCharge: credits, planLimit: monthlyLimit, used, overageAllowed })
    billedTo = decision.billedTo
    if (decision.needsWalletDeduction) {
      const result = await deductFromWallet(billing.userId, credits)
      if (!result.ok) throw new Error("Insufficient credits")
    }
  }

  await insertCreditUsage({ agentId, conversationId, messageType, source, creditsUsed: credits, billedTo })
}

/**
 * Record credits for one AI turn using real OpenAI token counts (token-weighted,
 * the same unit as the WhatsApp send path), routing to plan/wallet.
 *
 * Unlike chargeAiCredits this NEVER throws and always records usage — it's for
 * channels that deliver the reply BEFORE billing (e.g. the embed widget, which
 * bypasses the Baileys send queue entirely). Blocking an already-sent reply is
 * pointless, so we just make sure it gets counted. Returns null only when the
 * agent has no billing profile.
 */
export async function chargeAiTurn(opts: {
  agentId: string
  conversationId?: string
  tokensInput?: number
  tokensOutput?: number
  messageType?: "text" | "image"
}): Promise<{ creditsUsed: number; billedTo: "plan" | "wallet" } | null> {
  const { agentId, conversationId, tokensInput, tokensOutput } = opts
  const messageType = opts.messageType === "image" ? "image" : "text"

  const hasTokens =
    typeof tokensInput === "number" && typeof tokensOutput === "number" &&
    (tokensInput > 0 || tokensOutput > 0)
  const credits = hasTokens
    ? creditsForTokens(tokensInput!, tokensOutput!)
    : creditsForMessageType(messageType)

  const billing = await getAgentBillingInfo(agentId)
  if (!billing) return null

  let billedTo: "plan" | "wallet" = "plan"
  const monthlyLimit = effectiveCreditLimit(PLAN_CREDIT_LIMITS[billing.plan] ?? PLAN_CREDIT_LIMITS.free, billing.carryoverCredits, billing.carryoverExpiresAt)
  const overageAllowed = allowsOverage(billing.plan)
  if (monthlyLimit !== -1) {
    const { start, end } = getBillingPeriod(billing.subscriptionExpiresAt)
    const used = await getMonthlyCreditsUsedForUser(billing.userId, start, end)
    const decision = routeMessageCharge({ creditsToCharge: credits, planLimit: monthlyLimit, used, overageAllowed })
    billedTo = decision.billedTo
    if (decision.needsWalletDeduction) {
      // Best-effort — record even if the wallet can't fully cover it (the reply
      // already went out). billedTo stays "wallet" so accounting is accurate.
      await deductFromWallet(billing.userId, credits)
    }
  }

  await insertCreditUsage({
    agentId,
    conversationId,
    messageType,
    source: "ai",
    creditsUsed: credits,
    tokensInput: hasTokens ? tokensInput : null,
    tokensOutput: hasTokens ? tokensOutput : null,
    billedTo,
  })
  return { creditsUsed: credits, billedTo }
}
