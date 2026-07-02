import { db } from "@/lib/db"
import { creditsForTokens } from "@/lib/credits"
import { PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K, effectiveCreditLimit } from "@/lib/plans"
import { getBillingPeriod } from "@/lib/billing-period"
import { sumCreditsForAgents } from "@/lib/creditUsage"
import { getBalance, deductFromWallet } from "@/lib/creditWallet"

// Billing for the External Developer API. Mirrors the worker's WhatsApp charge
// flow (worker/src/queue/outbound-queue.ts) so API calls bill against the SAME
// ledger: token-weighted credits → plan-vs-wallet routing → CreditUsage row.

// Starter/Pro can overshoot their plan allowance (overage); Free/Basic must
// fall back to the PAYG wallet. Derived from the per-1k overage rate: a null
// rate means "no overage allowed". Matches worker/src/billing/credits.ts.
export function allowsOverage(plan: string): boolean {
  return PLAN_OVERAGE_RATE_PER_1K[plan] != null
}

export interface RoutingInput {
  creditsToCharge: number
  planLimit: number // -1 for unlimited (enterprise)
  used: number // already charged this billing period
  overageAllowed: boolean
}

export interface RoutingDecision {
  billedTo: "plan" | "wallet"
  needsWalletDeduction: boolean
}

// Ported verbatim from worker/src/billing/wallet.ts `routeMessageCharge`. Keep
// the two in sync — when the plan would overflow, the FULL turn bills to wallet
// (overshoot by at most one turn per cycle boundary, for clean accounting).
export function routeMessageCharge(input: RoutingInput): RoutingDecision {
  const { creditsToCharge, planLimit, used, overageAllowed } = input
  if (planLimit === -1) return { billedTo: "plan", needsWalletDeduction: false }
  const fits = used + creditsToCharge <= planLimit
  if (fits) return { billedTo: "plan", needsWalletDeduction: false }
  if (overageAllowed) return { billedTo: "plan", needsWalletDeduction: false }
  return { billedTo: "wallet", needsWalletDeduction: true }
}

export interface AgentBillingContext {
  userId: string
  plan: string
  subscriptionExpiresAt: Date | null
  carryoverCredits: number
  carryoverExpiresAt: Date | null
}

// Resolve the agent's owner + plan. Returns null if the agent doesn't exist.
export async function getAgentBillingContext(agentId: string): Promise<AgentBillingContext | null> {
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true } })
  if (!agent) return null
  const user = await db.user.findUnique({
    where: { id: agent.userId },
    select: { plan: true, subscriptionExpiresAt: true, carryoverCredits: true, carryoverExpiresAt: true },
  })
  if (!user) return null
  return {
    userId: agent.userId,
    plan: user.plan ?? "free",
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    carryoverCredits: user.carryoverCredits ?? 0,
    carryoverExpiresAt: user.carryoverExpiresAt ?? null,
  }
}

export interface PreflightResult {
  ok: boolean
  reason?: "SUBSCRIPTION_EXPIRED" | "INSUFFICIENT_CREDITS"
}

// Can this account pay for at least one more turn? Run before the LLM call so we
// don't do (paid) work for an account that definitively can't cover it.
export async function preflightApiCharge(
  ctx: AgentBillingContext,
  agentId: string
): Promise<PreflightResult> {
  const expired = ctx.subscriptionExpiresAt ? new Date() > ctx.subscriptionExpiresAt : false
  if (expired) return { ok: false, reason: "SUBSCRIPTION_EXPIRED" }

  const planLimit = effectiveCreditLimit(PLAN_CREDIT_LIMITS[ctx.plan] ?? PLAN_CREDIT_LIMITS.free, ctx.carryoverCredits, ctx.carryoverExpiresAt)
  if (planLimit === -1) return { ok: true } // unlimited
  if (allowsOverage(ctx.plan)) return { ok: true } // starter/pro can overshoot

  const { start, end } = getBillingPeriod(ctx.subscriptionExpiresAt)
  const used = await sumCreditsForAgents([agentId], start, end)
  if (used < planLimit) return { ok: true } // plan still has room

  const wallet = await getBalance(ctx.userId)
  if (wallet.creditBalance > 0) return { ok: true }
  return { ok: false, reason: "INSUFFICIENT_CREDITS" }
}

export interface ChargeResult {
  credits: number
  billedTo: "plan" | "wallet"
}

// Charge an actual turn (post-call) from real token counts and record a
// CreditUsage row with source='api'. The pre-flight already guaranteed a
// positive balance, so a failed wallet deduction is allowed to overshoot by at
// most one turn — the usage is always recorded for audit.
export async function chargeApiTurn(params: {
  agentId: string
  conversationId: string | null
  ctx: AgentBillingContext
  inputTokens: number
  outputTokens: number
}): Promise<ChargeResult> {
  const { agentId, conversationId, ctx, inputTokens, outputTokens } = params
  const credits = creditsForTokens(inputTokens, outputTokens)

  const planLimit = effectiveCreditLimit(PLAN_CREDIT_LIMITS[ctx.plan] ?? PLAN_CREDIT_LIMITS.free, ctx.carryoverCredits, ctx.carryoverExpiresAt)
  let billedTo: "plan" | "wallet" = "plan"

  if (planLimit !== -1) {
    const { start, end } = getBillingPeriod(ctx.subscriptionExpiresAt)
    const used = await sumCreditsForAgents([agentId], start, end)
    const decision = routeMessageCharge({
      creditsToCharge: credits,
      planLimit,
      used,
      overageAllowed: allowsOverage(ctx.plan),
    })
    billedTo = decision.billedTo
    if (decision.needsWalletDeduction) {
      await deductFromWallet(ctx.userId, credits)
    }
  }

  await db.creditUsage.create({
    data: {
      agentId,
      conversationId,
      messageType: "text",
      source: "api",
      creditsUsed: credits,
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      billedTo,
    },
  })

  return { credits, billedTo }
}

// Remaining credits = plan allowance left this cycle + wallet balance. Used for
// the response's remaining_credits field.
export async function getRemainingCredits(
  ctx: AgentBillingContext,
  agentId: string
): Promise<number> {
  const wallet = await getBalance(ctx.userId)
  const planLimit = effectiveCreditLimit(PLAN_CREDIT_LIMITS[ctx.plan] ?? PLAN_CREDIT_LIMITS.free, ctx.carryoverCredits, ctx.carryoverExpiresAt)
  if (planLimit === -1) return wallet.creditBalance
  const { start, end } = getBillingPeriod(ctx.subscriptionExpiresAt)
  const used = await sumCreditsForAgents([agentId], start, end)
  const planRemaining = Math.max(0, planLimit - used)
  return planRemaining + wallet.creditBalance
}
