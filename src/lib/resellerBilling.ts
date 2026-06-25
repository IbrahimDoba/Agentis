import { db } from "@/lib/db"
import { checkAndEnforceUserAgentLimits } from "@/lib/agentLimitCheck"

// Reseller billing: a reseller is allocated a wholesale credit POOL. She
// defines her own plans (ResellerPlan) and MANUALLY activates one for a user
// (after collecting payment however she likes). Activation debits her pool and
// grants the user credits into the existing PAYG wallet — reseller users run on
// the "reseller" plan (0 monthly allowance), so every send draws that wallet.
//
// No per-send worker change is needed: the wallet IS the existing spend path.

const DAY_MS = 24 * 60 * 60 * 1000

export type ActivateResult =
  | { ok: true; planName: string; credits: number; expiresAt: Date; poolRemaining: number }
  | { ok: false; error: string }

/**
 * Activate a reseller plan for one of the reseller's users. Atomic: the pool
 * debit is guarded so it can never go negative, and the user grant happens in
 * the same transaction.
 */
export async function activateResellerPlan(opts: {
  resellerId: string
  userId: string
  planId: string
}): Promise<ActivateResult> {
  const { resellerId, userId, planId } = opts

  const outcome = await db.$transaction(async (tx) => {
    const plan = await tx.resellerPlan.findFirst({
      where: { id: planId, resellerId, active: true },
    })
    if (!plan) return { ok: false as const, error: "Plan not found" }

    // The user must belong to THIS reseller — never let one tenant touch another's user.
    const user = await tx.user.findFirst({
      where: { id: userId, resellerId },
      select: { id: true },
    })
    if (!user) return { ok: false as const, error: "User not found in your tenant" }

    // Atomic, guarded pool debit. updateMany with a `gte` guard means concurrent
    // activations can never overdraw the pool — only those it can cover succeed.
    const debit = await tx.reseller.updateMany({
      where: { id: resellerId, creditPool: { gte: plan.credits } },
      data: { creditPool: { decrement: plan.credits } },
    })
    if (debit.count === 0) {
      return { ok: false as const, error: "Insufficient pool balance — top up the reseller's pool first" }
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + plan.durationDays * DAY_MS)

    await tx.user.update({
      where: { id: userId },
      data: {
        plan: "reseller",
        subscriptionStatus: "active",
        subscriptionExpiresAt: expiresAt,
        status: "APPROVED",
        // Grant the plan's credits into the PAYG wallet; expiry == plan duration.
        creditBalance: { increment: plan.credits },
        creditsExpireAt: expiresAt,
      },
    })

    const reseller = await tx.reseller.findUnique({
      where: { id: resellerId },
      select: { creditPool: true },
    })

    return {
      ok: true as const,
      planName: plan.name,
      credits: plan.credits,
      expiresAt,
      poolRemaining: reseller?.creditPool ?? 0,
    }
  })

  // Re-enable messaging on the user's agents now that they have credits/validity.
  if (outcome.ok) {
    await checkAndEnforceUserAgentLimits(userId).catch((err) =>
      console.error("[resellerBilling] re-enable agents error:", err)
    )
  }

  return outcome
}
