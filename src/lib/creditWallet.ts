import { db } from "@/lib/db"
import { nextCreditExpiry } from "./credits"

// PAYG wallet operations. Plan-allowance accounting still lives in
// creditUsage.ts + agentLimitCheck.ts; this module is purely the top-up
// balance that drains AFTER the plan allowance is exhausted for the cycle.

export interface WalletBalance {
  /** Spendable credits NOW (returns 0 if the lot has expired). */
  creditBalance: number
  /** Rolling 12-month expiry of the entire wallet. Null if never topped up. */
  creditsExpireAt: Date | null
  /** The raw stored balance regardless of expiry — for audit/admin UIs. */
  rawCreditBalance: number
}

function isExpired(expiresAt: Date | null | undefined, now: Date): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime()
}

/**
 * Return the user's spendable wallet balance. Once `creditsExpireAt` has
 * passed, the spendable balance is 0 even if the row still holds credits —
 * the next top-up overwrites the row.
 */
export async function getBalance(userId: string, now: Date = new Date()): Promise<WalletBalance> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { creditBalance: true, creditsExpireAt: true },
  })
  const raw = u?.creditBalance ?? 0
  const expiresAt = u?.creditsExpireAt ?? null
  return {
    creditBalance: isExpired(expiresAt, now) ? 0 : raw,
    creditsExpireAt: expiresAt,
    rawCreditBalance: raw,
  }
}

/**
 * Grant credits to a user (e.g. on a successful Paystack purchase) and reset
 * the wallet expiry to (now + 12 months). The expiry reset means an active
 * user who tops up regularly never loses credits.
 *
 * Note: this does NOT handle Paystack reconciliation — the caller (the
 * webhook handler) is responsible for idempotency via CreditPurchase.reference.
 */
export async function addCredits(
  userId: string,
  amount: number,
  now: Date = new Date()
): Promise<WalletBalance> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("creditWallet.addCredits: amount must be a positive number")
  }
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      creditBalance: { increment: Math.floor(amount) },
      creditsExpireAt: nextCreditExpiry(now),
    },
    select: { creditBalance: true, creditsExpireAt: true },
  })
  return {
    creditBalance: updated.creditBalance,
    creditsExpireAt: updated.creditsExpireAt,
    rawCreditBalance: updated.creditBalance,
  }
}

export interface DeductResult {
  /** True if the deduction succeeded; false if balance was insufficient/expired. */
  ok: boolean
  /** Balance after the deduction (or the unchanged balance if ok=false). */
  newBalance: number
}

/**
 * Atomic deduction. Uses a single `UPDATE … RETURNING WHERE creditBalance >= $1`
 * so that N concurrent deductions can NEVER race past zero — Postgres
 * serializes the row write, and only the ones that can be satisfied succeed.
 * Also enforces non-expired via the WHERE clause — expired credits aren't
 * spendable even when the stored balance is positive.
 */
export async function deductFromWallet(
  userId: string,
  amount: number
): Promise<DeductResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    const current = await getBalance(userId)
    return { ok: true, newBalance: current.creditBalance }
  }

  const n = Math.floor(amount)
  const rows = await db.$queryRaw<{ creditBalance: number }[]>`
    UPDATE "User"
    SET    "creditBalance" = "creditBalance" - ${n}
    WHERE  "id" = ${userId}
      AND  "creditBalance" >= ${n}
      AND  ("creditsExpireAt" IS NULL OR "creditsExpireAt" > NOW())
    RETURNING "creditBalance"
  `

  if (rows.length === 0) {
    const current = await getBalance(userId)
    return { ok: false, newBalance: current.creditBalance }
  }
  return { ok: true, newBalance: rows[0].creditBalance }
}
