import { db } from "@/lib/db"
import { PLAN_LABELS } from "@/lib/plans"
import {
  sendSubscriptionExpiringSoonEmail,
  sendSubscriptionExpiredEmail,
} from "@/lib/email"

// Picks the day window we use for "expiring soon" warnings. 5–8 days
// inclusive gives the daily scan a 4-day catch range so a user is never
// missed even if the cron skips a run. We track which users already got
// the email so a user gets exactly one warning, regardless of how many
// times this runs inside the window.
const WARNING_DAYS_MIN = 5
const WARNING_DAYS_MAX = 8

export interface ExpiryScanSummary {
  scanned: number
  warned: number
  expired: number
  skippedAlreadyNotified: number
  errors: { userId: string; email: string; stage: "warning" | "expired"; message: string }[]
}

// Run once daily (typically via cron hitting /api/cron/subscription-expiry).
// Safe to run more often — sent emails are idempotent via the per-user
// expiryWarningEmailSentAt / expiredEmailSentAt columns. Skips free plan
// users (no subscription period to expire).
export async function runSubscriptionExpiryScan(): Promise<ExpiryScanSummary> {
  const summary: ExpiryScanSummary = {
    scanned: 0,
    warned: 0,
    expired: 0,
    skippedAlreadyNotified: 0,
    errors: [],
  }

  // Pull every paid-plan user with a configured expiry. We do the date math
  // in JS rather than SQL so we don't have to wrangle timezone quirks per
  // Neon connection.
  const users = await db.user.findMany({
    where: {
      plan: { not: "free" },
      subscriptionExpiresAt: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      subscriptionExpiresAt: true,
      expiryWarningEmailSentAt: true,
      expiredEmailSentAt: true,
    },
  })

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  for (const user of users) {
    summary.scanned++
    if (!user.subscriptionExpiresAt) continue

    const expiresAt = user.subscriptionExpiresAt
    const msUntilExpiry = expiresAt.getTime() - now
    const daysUntilExpiry = Math.ceil(msUntilExpiry / dayMs)
    const planLabel = PLAN_LABELS[user.plan] ?? user.plan

    // 1) Already past expiry — send the "expired" email if we haven't yet.
    if (msUntilExpiry <= 0) {
      if (user.expiredEmailSentAt) {
        summary.skippedAlreadyNotified++
        continue
      }
      try {
        await sendSubscriptionExpiredEmail({
          name: user.name,
          email: user.email,
          planLabel,
          expiresAt,
        })
        await db.user.update({
          where: { id: user.id },
          data: { expiredEmailSentAt: new Date() },
        })
        summary.expired++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        summary.errors.push({ userId: user.id, email: user.email, stage: "expired", message })
      }
      continue
    }

    // 2) Inside the warning window — send the "expiring soon" email if we
    // haven't yet. Outside the window is a no-op (either too far away or
    // overlapping with the expired branch above).
    if (daysUntilExpiry >= WARNING_DAYS_MIN && daysUntilExpiry <= WARNING_DAYS_MAX) {
      if (user.expiryWarningEmailSentAt) {
        summary.skippedAlreadyNotified++
        continue
      }
      try {
        await sendSubscriptionExpiringSoonEmail({
          name: user.name,
          email: user.email,
          planLabel,
          daysRemaining: daysUntilExpiry,
          expiresAt,
        })
        await db.user.update({
          where: { id: user.id },
          data: { expiryWarningEmailSentAt: new Date() },
        })
        summary.warned++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        summary.errors.push({ userId: user.id, email: user.email, stage: "warning", message })
      }
    }
  }

  return summary
}

// Used by the admin "reset usage" path to clear the sent-flags so the user
// gets a fresh warning + expired email cycle for the new subscription period.
export async function clearExpiryNotificationFlags(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      expiryWarningEmailSentAt: null,
      expiredEmailSentAt: null,
    },
  })
}
