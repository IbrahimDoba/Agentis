import { db } from "@/lib/db"
import { PLAN_CREDIT_LIMITS, effectiveCreditLimit } from "@/lib/plans"
import { getBillingPeriod } from "@/lib/billing-period"
import { sumCreditsForUser } from "@/lib/creditUsage"
import { deductFromWallet } from "@/lib/creditWallet"
import {
  type AgentBillingContext,
  allowsOverage,
  routeMessageCharge,
} from "@/lib/apiBilling"

// "Polish my draft" billing. The conversation composer lets a human operator
// ask the AI to rewrite the reply they're about to send (fix errors, improve
// clarity, keep their voice). Normal AI sends are token-weighted and human
// sends are FREE — this is a deliberate, fixed-cost convenience action that
// sits between the two, so it gets its own flat price and its own ledger
// `source` ("assist").
export const DRAFT_ASSIST_CREDITS = 2

/**
 * Charge one draft-assist action: a flat DRAFT_ASSIST_CREDITS, routed
 * plan→wallet exactly like any other charge (see apiBilling.routeMessageCharge
 * for the truth table). Records a CreditUsage row with source="assist" so the
 * spend is auditable and counts toward the plan total — it just stays out of
 * the ai/human breakdown used by the stats page.
 *
 * Call AFTER a successful generation: the pre-flight already guaranteed the
 * account can cover at least one action, so a failed wallet deduction is
 * allowed to overshoot by at most this one action (the usage is still
 * recorded for audit).
 */
export async function chargeDraftAssist(params: {
  agentId: string
  conversationId: string | null
  ctx: AgentBillingContext
  tokensInput: number
  tokensOutput: number
}): Promise<{ credits: number; billedTo: "plan" | "wallet" }> {
  const { agentId, conversationId, ctx, tokensInput, tokensOutput } = params
  const credits = DRAFT_ASSIST_CREDITS

  const planLimit = effectiveCreditLimit(PLAN_CREDIT_LIMITS[ctx.plan] ?? PLAN_CREDIT_LIMITS.free, ctx.carryoverCredits, ctx.carryoverExpiresAt)
  let billedTo: "plan" | "wallet" = "plan"

  if (planLimit !== -1) {
    const { start, end } = getBillingPeriod(ctx.subscriptionExpiresAt, ctx.currentPeriodStart)
    const used = await sumCreditsForUser(ctx.userId, start, end)
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
      source: "assist",
      creditsUsed: credits,
      tokensInput,
      tokensOutput,
      billedTo,
    },
  })

  return { credits, billedTo }
}
