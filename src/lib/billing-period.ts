/**
 * Returns the start and end of the current billing cycle.
 *
 * Preferred path: an explicit `currentPeriodStart` anchor, stamped on every
 * activation / renewal / admin reset. The window is simply
 * [currentPeriodStart, subscriptionExpiresAt].
 *
 * Fallback (no anchor — free/expired plans, or a user last billed before the
 * anchor existed): a rolling 30-day window anchored to expiry.
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function getBillingPeriod(
  subscriptionExpiresAt: Date | null | undefined,
  currentPeriodStart?: Date | null,
): {
  start: Date
  end: Date
} {
  // Explicit anchor wins. Inferring the start from expiry is the bug this
  // replaces: `nextExpiry` moves expiry by a calendar month (28–31d) while the
  // fallback below steps a fixed 30 days, so on a 31-day month the inferred
  // window walks ~30 days too far back and re-counts the previous cycle — a
  // lapsed resubscribe never reset its usage to 0.
  const now = Date.now()

  if (currentPeriodStart) {
    let start = new Date(currentPeriodStart).getTime()
    let end = subscriptionExpiresAt
      ? new Date(subscriptionExpiresAt).getTime()
      : start + THIRTY_DAYS_MS
    // A subscription that lapsed without a fresh anchor leaves this window
    // entirely in the past; roll it forward in whole cycles so it contains
    // `now`. Otherwise every current charge falls outside the window, the
    // usage sum reads ~0, and the plan cap silently stops applying — a free
    // ride for any lapsed-to-free account (the leak this fixes).
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
    // Walk the 30-day window to the cycle containing `now`: back when expiry is
    // in the future (a mid-cycle upgrade *extended* it), forward when it's in
    // the past (a lapsed plan). Either way the window must contain `now`, or
    // current usage is billed for free.
    while (end - THIRTY_DAYS_MS > now) end -= THIRTY_DAYS_MS
    while (end <= now) end += THIRTY_DAYS_MS
    return { start: new Date(end - THIRTY_DAYS_MS), end: new Date(end) }
  }
  // Free plan or no subscription — rolling 30-day window ending now.
  return { start: new Date(now - THIRTY_DAYS_MS), end: new Date(now) }
}
