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
  | { ok: true; planName: string; credits: number; poolDebited: number; expiresAt: Date; poolRemaining: number }
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
      select: { id: true, creditBalance: true },
    })
    if (!user) return { ok: false as const, error: "User not found in your tenant" }

    // Changing a plan OVERWRITES the wallet — it does not stack. The user's
    // current (unused) balance is returned to the pool and the new plan's
    // credits are issued from it, so the pool only moves by the difference:
    // an upgrade costs the gap, a downgrade refunds the surplus.
    //   e.g. user has 3,000 and switches to a 5,000 plan → wallet becomes 5,000
    //        and the pool drops by 2,000 (not 5,000).
    const current = user.creditBalance ?? 0
    const netDebit = plan.credits - current

    if (netDebit > 0) {
      // Upgrade: draw only the shortfall, guarded with a `gte` so concurrent
      // activations can never overdraw the pool — only those it can cover succeed.
      const debit = await tx.reseller.updateMany({
        where: { id: resellerId, creditPool: { gte: netDebit } },
        data: { creditPool: { decrement: netDebit } },
      })
      if (debit.count === 0) {
        return { ok: false as const, error: "Insufficient pool balance — top up the reseller's pool first" }
      }
    } else if (netDebit < 0) {
      // Downgrade: the unused surplus reverts to the pool.
      await tx.reseller.update({
        where: { id: resellerId },
        data: { creditPool: { increment: -netDebit } },
      })
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
        // Overwrite the PAYG wallet to exactly the plan's credits; expiry == plan duration.
        creditBalance: plan.credits,
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
      poolDebited: netDebit,
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

export type AdjustResult =
  | { ok: true; newBalance: number; poolRemaining: number }
  | { ok: false; error: string }

/**
 * Manually add or deduct a customer's credits — e.g. the reseller charges the
 * customer in credits for an off-platform service (a logo design, etc.).
 *
 * - "add"    → draws the amount from the reseller's pool into the customer's
 *              wallet, guarded so the pool can never overdraw.
 * - "deduct" → removes the amount from the customer's wallet, treated as spent,
 *              so it does NOT return to the pool. Guarded so the wallet can
 *              never go negative.
 *
 * Strictly tenant-scoped: the user must belong to this reseller.
 */
export async function adjustResellerUserCredits(opts: {
  resellerId: string
  userId: string
  action: "add" | "deduct"
  amount: number
}): Promise<AdjustResult> {
  const { resellerId, userId, action } = opts
  const amount = Math.floor(opts.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a positive whole number of credits" }
  }

  const outcome = await db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, resellerId },
      select: { id: true, creditBalance: true },
    })
    if (!user) return { ok: false as const, error: "User not found in your tenant" }

    if (action === "add") {
      // Draw from the pool, guarded so concurrent grants can't overdraw it.
      const debit = await tx.reseller.updateMany({
        where: { id: resellerId, creditPool: { gte: amount } },
        data: { creditPool: { decrement: amount } },
      })
      if (debit.count === 0) {
        return { ok: false as const, error: "Insufficient pool balance — top up the reseller's pool first" }
      }
      await tx.user.update({
        where: { id: userId },
        data: { creditBalance: { increment: amount } },
      })
    } else {
      // Deduct: consume from the wallet (never below zero). Pool is untouched.
      const dec = await tx.user.updateMany({
        where: { id: userId, resellerId, creditBalance: { gte: amount } },
        data: { creditBalance: { decrement: amount } },
      })
      if (dec.count === 0) {
        return { ok: false as const, error: `Customer only has ${(user.creditBalance ?? 0).toLocaleString()} credits` }
      }
    }

    const [reseller, updated] = await Promise.all([
      tx.reseller.findUnique({ where: { id: resellerId }, select: { creditPool: true } }),
      tx.user.findUnique({ where: { id: userId }, select: { creditBalance: true } }),
    ])

    return {
      ok: true as const,
      newBalance: updated?.creditBalance ?? 0,
      poolRemaining: reseller?.creditPool ?? 0,
    }
  })

  // Keep agent messaging consistent with the new balance (disable at zero,
  // re-enable when credited).
  if (outcome.ok) {
    await checkAndEnforceUserAgentLimits(userId).catch((err) =>
      console.error("[resellerBilling] enforce agents after adjust error:", err)
    )
  }

  return outcome
}
