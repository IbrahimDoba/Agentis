/**
 * Returns the start and end of the current 30-day billing cycle.
 *
 * If a subscriptionExpiresAt exists, the period is anchored to it:
 *   start = subscriptionExpiresAt - 30 days
 *   end   = subscriptionExpiresAt
 *
 * This means credits reset on the user's subscription anniversary, not
 * the calendar month. For free/expired plans we fall back to a rolling
 * 30-day window ending now.
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function getBillingPeriod(subscriptionExpiresAt: Date | null | undefined): {
  start: Date
  end: Date
} {
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
