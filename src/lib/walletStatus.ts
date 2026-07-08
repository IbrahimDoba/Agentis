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
