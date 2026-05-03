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
export function getBillingPeriod(subscriptionExpiresAt: Date | null | undefined): {
  start: Date
  end: Date
} {
  if (subscriptionExpiresAt) {
    const end = new Date(subscriptionExpiresAt)
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { start, end }
  }
  // Free plan or no subscription — rolling 30-day window
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { start, end }
}
