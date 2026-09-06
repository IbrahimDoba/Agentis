// Mirror of src/lib/billing-period.ts — keep in sync. The worker receives dates
// as ISO strings from SQL, so both params also accept `string`.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function getBillingPeriod(
  subscriptionExpiresAt: Date | string | null | undefined,
  currentPeriodStart?: Date | string | null,
): {
  start: Date
  end: Date
} {
  // Explicit anchor (stamped on activation/renewal/reset) wins — see the app
  // copy for why inferring the start from expiry drifts a full cycle on 31-day
  // months.
  const now = Date.now()

  if (currentPeriodStart) {
    let start = new Date(currentPeriodStart).getTime()
    let end = subscriptionExpiresAt
      ? new Date(subscriptionExpiresAt).getTime()
      : start + THIRTY_DAYS_MS
    // A subscription that lapsed without a fresh anchor leaves this window
    // entirely in the past; roll it forward in whole cycles so it contains
    // `now`. Otherwise every current charge falls outside the window, the usage
    // sum reads ~0, and the plan cap silently stops applying — a free ride for
    // any lapsed-to-free account (the leak this fixes).
    if (end <= now) {
      const cycle = Math.max(THIRTY_DAYS_MS, end - start)
      const steps = Math.ceil((now - end) / cycle)
      start += steps * cycle
      end += steps * cycle
    }
    return { start: new Date(start), end: new Date(end) }
  }

  if (subscriptionExpiresAt) {
    let end = new Date(subscriptionExpiresAt).getTime()
    // Walk the 30-day window to the cycle containing `now`: back for a future
    // expiry (a mid-cycle upgrade extended it), forward for a past (lapsed) one.
    // Either way the window must contain `now`, or current usage is billed free.
    while (end - THIRTY_DAYS_MS > now) end -= THIRTY_DAYS_MS
    while (end <= now) end += THIRTY_DAYS_MS
    return { start: new Date(end - THIRTY_DAYS_MS), end: new Date(end) }
  }
  return { start: new Date(now - THIRTY_DAYS_MS), end: new Date(now) }
}
