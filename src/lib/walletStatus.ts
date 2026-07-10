// Pure, isomorphic wallet-status helper (safe to import from client and server —
// NO db import). Mirrors the canonical spend rule in deductFromWallet
// (`creditBalance >= n AND (creditsExpireAt IS NULL OR creditsExpireAt > NOW())`):
// a wallet is "usable" when it has a positive balance that hasn't expired.
//
// Use it to decide whether a PAYG wallet should keep an agent alive past
// plan/trial expiry, and to gate the "expired" UI so a paid, spendable wallet is
// never shown as expired.
export function hasUsableWallet(
  creditBalance: number | null | undefined,
  creditsExpireAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const balance = creditBalance ?? 0
  if (balance <= 0) return false
  if (!creditsExpireAt) return true // no expiry set = never expires (matches deductFromWallet)
  return new Date(creditsExpireAt).getTime() > now.getTime()
}

// Should the usage UI show the PAY-AS-YOU-GO bar instead of the plan bar?
// The plan allowance always takes priority while it's alive and has room;
// the wallet takes over the bar only when it is actually what's funding sends:
// the plan is expired OR its allowance is finished — and the wallet is usable.
// Mirrors the charge routing (plan first, wallet only on overflow).
export function paygTakeover(opts: {
  creditBalance: number | null | undefined
  creditsExpireAt: string | Date | null | undefined
  subscriptionExpiresAt: string | Date | null | undefined
  monthlyCreditsUsed: number
  creditLimit: number // -1 = unlimited
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  if (!hasUsableWallet(opts.creditBalance, opts.creditsExpireAt, now)) return false
  if (opts.creditLimit === -1) return false // unlimited plan never exhausts
  const planExpired = opts.subscriptionExpiresAt
    ? new Date(opts.subscriptionExpiresAt).getTime() <= now.getTime()
    : false
  const planExhausted = opts.creditLimit <= 0 || opts.monthlyCreditsUsed >= opts.creditLimit
  return planExpired || planExhausted
}
