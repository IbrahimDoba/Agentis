import { sql } from "../db/client.js"

// PAYG wallet operations for the worker. Mirrors src/lib/creditWallet.ts on
// the Next.js side — kept in sync intentionally. Both use the same atomic
// `UPDATE … RETURNING WHERE creditBalance >= $1` pattern so concurrent
// deductions (parallel message sends for one user) can't race past zero.

export interface DeductResult {
  ok: boolean
  newBalance: number
}

export async function getWalletBalance(userId: string): Promise<number> {
  const rows = await sql<{ creditBalance: number; creditsExpireAt: string | null }[]>`
    SELECT "creditBalance", "creditsExpireAt"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `
  const u = rows[0]
  if (!u) return 0
  if (u.creditsExpireAt && new Date(u.creditsExpireAt).getTime() <= Date.now()) return 0
  return u.creditBalance
}

/**
 * Atomic deduction. Returns ok=false (and the unchanged balance) when the
 * user doesn't have enough credits OR their wallet has expired. The single
 * `UPDATE … RETURNING` ensures concurrent deductions are serialized by
 * Postgres — only the ones that can be satisfied succeed.
 */
export async function deductFromWallet(userId: string, amount: number): Promise<DeductResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: true, newBalance: await getWalletBalance(userId) }
  }
  const n = Math.floor(amount)
  const rows = await sql<{ creditBalance: number }[]>`
    UPDATE "User"
    SET    "creditBalance" = "creditBalance" - ${n}
    WHERE  "id" = ${userId}
      AND  "creditBalance" >= ${n}
      AND  ("creditsExpireAt" IS NULL OR "creditsExpireAt" > NOW())
    RETURNING "creditBalance"
  `
  if (rows.length === 0) {
    return { ok: false, newBalance: await getWalletBalance(userId) }
  }
  return { ok: true, newBalance: rows[0].creditBalance }
}

// ── Pure routing decision: where does this charge land? ───────────────────
// Extracted so the truth table is unit-testable without the DB.

export type BilledTo = "plan" | "wallet"
export interface RoutingInput {
  creditsToCharge: number
  planLimit: number          // -1 for unlimited (enterprise)
  used: number               // already charged this billing period
  overageAllowed: boolean    // starter/pro can overshoot the plan
}
export interface RoutingDecision {
  /** "plan" if the plan covers it (incl. allowed overage); "wallet" if the wallet must cover. */
  billedTo: BilledTo
  /** When true, the caller MUST attempt to deduct `creditsToCharge` from the wallet. */
  needsWalletDeduction: boolean
  /** Hint for the rate-limit error when nothing can pay. */
  exhausted: boolean
}

/**
 * Decide whether a single message-send is billed to the plan allowance or to
 * the PAYG wallet. Simpler than per-message split-billing: when the plan
 * cycle would overflow, the FULL message bills to wallet. Overshoot by at
 * most one message per cycle boundary, in exchange for clean accounting.
 */
export function routeMessageCharge(input: RoutingInput): RoutingDecision {
  const { creditsToCharge, planLimit, used, overageAllowed } = input
  // Unlimited (enterprise) — plan covers everything.
  if (planLimit === -1) return { billedTo: "plan", needsWalletDeduction: false, exhausted: false }

  const fits = used + creditsToCharge <= planLimit
  if (fits) return { billedTo: "plan", needsWalletDeduction: false, exhausted: false }

  // Plan would overflow this message.
  if (overageAllowed) {
    // Starter/Pro — log overage to plan, no wallet needed.
    return { billedTo: "plan", needsWalletDeduction: false, exhausted: false }
  }
  // Free/Basic — try the wallet.
  return { billedTo: "wallet", needsWalletDeduction: true, exhausted: false }
}
