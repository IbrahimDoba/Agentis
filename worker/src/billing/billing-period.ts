export function getBillingPeriod(subscriptionExpiresAt: Date | string | null | undefined): {
  start: Date
  end: Date
} {
  if (subscriptionExpiresAt) {
    const end = new Date(subscriptionExpiresAt)
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { start, end }
  }
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { start, end }
}
