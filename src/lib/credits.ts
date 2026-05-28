// Token-weighted credit accounting.
//
// One credit corresponds to `TOKENS_PER_CREDIT` weighted tokens of LLM work,
// where one OUTPUT token counts as `OUTPUT_WEIGHT` weighted units. This matches
// the cost shape of gpt-4o-mini ($0.15/M input, $0.60/M output → 4× ratio), so
// the OpenAI cost per credit stays flat regardless of how the message splits
// between input and output. See PAYG_ANALYSIS.md §3 for the derivation.
//
// Old flat-rate accounting (AI_CREDIT_COSTS.text = 5) is kept in plans.ts for
// backwards-compatible read paths — historical CreditUsage rows are NOT
// retroactively repriced. New code charges via creditsForTokens().

export const TOKENS_PER_CREDIT = 1000
export const OUTPUT_WEIGHT = 4

/**
 * Convert real OpenAI token usage into credits. Always returns a positive
 * integer (≥ 1) so a zero-token edge case still records a chargeable event.
 * Floors to the nearest credit — the user is never billed for a fraction.
 */
export function creditsForTokens(inputTokens: number, outputTokens: number): number {
  const safeIn = Math.max(0, Math.floor(inputTokens || 0))
  const safeOut = Math.max(0, Math.floor(outputTokens || 0))
  const weighted = safeIn + safeOut * OUTPUT_WEIGHT
  // Math.max(1, …) so any non-trivial round-trip counts as at least 1 credit.
  // Without this a tiny "ok" reply could float to 0 and be effectively free,
  // which breaks both unit economics and the audit trail.
  return Math.max(1, Math.floor(weighted / TOKENS_PER_CREDIT))
}

// Per-credit retail rate when paid via the PAYG wallet (no plan allowance).
// Bulk-discount tiers live in `paygTiers` below. Used by the buy-credits UI
// and by Paystack purchase initiation to compute `creditsAdded`.
export const PAYG_DEFAULT_NGN_PER_CREDIT = 1.5

export interface PaygTier {
  amountNaira: number
  credits: number
  ngnPerCredit: number
}

// Larger packs get a small unit-rate discount; the smallest pack pays a premium
// because Paystack's flat-₦100 fee weighs more on tiny transactions. Margin at
// every tier stays above the 80% target (see PAYG_ANALYSIS.md §4).
export const PAYG_TIERS: readonly PaygTier[] = [
  { amountNaira: 1000,   credits: 600,    ngnPerCredit: 1.67 },
  { amountNaira: 5000,   credits: 3200,   ngnPerCredit: 1.56 },
  { amountNaira: 10000,  credits: 6500,   ngnPerCredit: 1.54 },
  { amountNaira: 20000,  credits: 13000,  ngnPerCredit: 1.54 },
  { amountNaira: 50000,  credits: 33500,  ngnPerCredit: 1.49 },
  { amountNaira: 100000, credits: 68000,  ngnPerCredit: 1.47 },
  { amountNaira: 200000, credits: 140000, ngnPerCredit: 1.43 },
] as const

/**
 * Find the tier the user picked. Returns null if the amount doesn't match a
 * configured tier — we deliberately don't allow arbitrary amounts in v1 so the
 * Paystack purchase + credits-granted math is always grounded in a known row.
 */
export function findPaygTier(amountNaira: number): PaygTier | null {
  return PAYG_TIERS.find((t) => t.amountNaira === amountNaira) ?? null
}

// Rolling 12-month expiry: every top-up resets the user's expiry to now+12mo.
// This way an active user never loses credits; a year-silent user zeros out.
export const CREDIT_EXPIRY_MONTHS = 12

/** Compute the expiry date applied to a user's wallet after a top-up. */
export function nextCreditExpiry(now: Date = new Date()): Date {
  const out = new Date(now)
  out.setMonth(out.getMonth() + CREDIT_EXPIRY_MONTHS)
  return out
}
