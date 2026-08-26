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
  if (currentPeriodStart) {
    const start = new Date(currentPeriodStart)
    const end = subscriptionExpiresAt
      ? new Date(subscriptionExpiresAt)
      : new Date(start.getTime() + THIRTY_DAYS_MS)
    return { start, end }
  }

  if (subscriptionExpiresAt) {
    let end = new Date(subscriptionExpiresAt).getTime()
    const now = Date.now()
    // If the expiry is more than one cycle out — e.g. a mid-cycle upgrade
    // *extended* it — walk the 30-day window back until it contains `now`.
    // Otherwise the window sits entirely in the future and current usage never
    // counts against the plan (i.e. free usage until the window catches up).
    while (end - THIRTY_DAYS_MS > now) end -= THIRTY_DAYS_MS
    return { start: new Date(end - THIRTY_DAYS_MS), end: new Date(end) }
  }
  // Free plan or no subscription — rolling 30-day window ending now.
  const end = Date.now()
  return { start: new Date(end - THIRTY_DAYS_MS), end: new Date(end) }
}
