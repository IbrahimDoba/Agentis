const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function getBillingPeriod(subscriptionExpiresAt: Date | string | null | undefined): {
  start: Date
  end: Date
} {
  if (subscriptionExpiresAt) {
    let end = new Date(subscriptionExpiresAt).getTime()
    const now = Date.now()
    // If the expiry is more than one cycle out (e.g. a mid-cycle upgrade extended
    // it), walk the 30-day window back until it contains `now` — otherwise the
    // window sits in the future and current usage never counts (free usage).
    // Mirror of src/lib/billing-period.ts — keep in sync.
    while (end - THIRTY_DAYS_MS > now) end -= THIRTY_DAYS_MS
    return { start: new Date(end - THIRTY_DAYS_MS), end: new Date(end) }
  }
  const end = Date.now()
  return { start: new Date(end - THIRTY_DAYS_MS), end: new Date(end) }
}
