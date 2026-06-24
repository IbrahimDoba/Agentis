import { db } from "@/lib/db"
import { PLAN_LABELS } from "@/lib/plans"
import {
  chargeRenewal,
  downgradeToFree,
  DUNNING_MAX_ATTEMPTS,
  DUNNING_GRACE_DAYS,
  type RenewableUser,
} from "@/lib/subscriptionBilling"
import { sendSubscriptionPaymentFailedEmail } from "@/lib/email"

const DAY_MS = 24 * 60 * 60 * 1000
const SAME_DAY_GUARD_MS = 20 * 60 * 60 * 1000 // skip a 2nd attempt within ~a day

export interface RenewalScanSummary {
  scanned: number
  renewed: number
  failed: number      // a dunning attempt failed (still within grace)
  downgraded: number  // moved to Free (grace exhausted, or cancelled at period end)
  skipped: number
  errors: { userId: string; message: string }[]
}

// Run daily (alongside the expiry-email scan). Charges saved cards for due
// subscriptions, runs dunning (retry → grace → downgrade), and downgrades
// cancelled subscriptions at period end. Idempotent for a daily single run:
// once a charge succeeds, expiry moves forward so the user is no longer due;
// the per-user same-day guard stops a second attempt within a day.
export async function runSubscriptionRenewalScan(now: Date = new Date()): Promise<RenewalScanSummary> {
  const summary: RenewalScanSummary = {
    scanned: 0, renewed: 0, failed: 0, downgraded: 0, skipped: 0, errors: [],
  }

  const users = await db.user.findMany({
    where: { plan: { not: "free" }, subscriptionExpiresAt: { not: null } },
    select: {
      id: true, name: true, email: true, plan: true, subscriptionExpiresAt: true,
      autoRenew: true, cancelAtPeriodEnd: true,
      paystackAuthorizationCode: true, authorizationReusable: true, pendingPlan: true,
      renewalRetryCount: true, lastRenewalAttemptAt: true,
    },
  })

  for (const u of users) {
    summary.scanned++
    const expiry = u.subscriptionExpiresAt
    if (!expiry) { summary.skipped++; continue }
    const msUntil = expiry.getTime() - now.getTime()
    const expired = msUntil <= 0
    const graceOver = msUntil < -DUNNING_GRACE_DAYS * DAY_MS

    try {
      // (1) Auto-renew OFF (cancelled, or never enabled) → downgrade once expired.
      if (!u.autoRenew) {
        if (expired) { await downgradeToFree(u.id); summary.downgraded++ } else summary.skipped++
        continue
      }

      // (2) Auto-renew ON but no reusable card → can't charge; let it lapse to
      //     Free once the grace window passes.
      if (!u.paystackAuthorizationCode || !u.authorizationReusable) {
        if (graceOver) { await downgradeToFree(u.id); summary.downgraded++ } else summary.skipped++
        continue
      }

      // (3) Not due yet (more than ~1 day before expiry) → leave it.
      if (msUntil > DAY_MS) { summary.skipped++; continue }

      // (4) Grace exhausted (too many attempts or too long past expiry) → Free.
      if (u.renewalRetryCount >= DUNNING_MAX_ATTEMPTS || graceOver) {
        await downgradeToFree(u.id); summary.downgraded++; continue
      }

      // (5) Same-day guard — at most one charge attempt per user per day.
      if (u.lastRenewalAttemptAt && now.getTime() - u.lastRenewalAttemptAt.getTime() < SAME_DAY_GUARD_MS) {
        summary.skipped++; continue
      }

      // (6) Attempt the renewal charge.
      const ru: RenewableUser = {
        id: u.id, email: u.email, plan: u.plan, subscriptionExpiresAt: u.subscriptionExpiresAt,
        paystackAuthorizationCode: u.paystackAuthorizationCode,
        authorizationReusable: u.authorizationReusable,
        pendingPlan: u.pendingPlan,
      }
      const res = await chargeRenewal(ru)

      if (res.result === "renewed") { summary.renewed++; continue }

      if (res.result === "charge_failed") {
        const attempt = u.renewalRetryCount + 1
        await db.user.update({
          where: { id: u.id },
          data: { renewalRetryCount: attempt, subscriptionStatus: "past_due" },
        })
        try {
          await sendSubscriptionPaymentFailedEmail({
            name: u.name, email: u.email, planLabel: PLAN_LABELS[u.plan] ?? u.plan,
            attempt, maxAttempts: DUNNING_MAX_ATTEMPTS,
            graceEndsAt: new Date(expiry.getTime() + DUNNING_GRACE_DAYS * DAY_MS),
          })
        } catch (err) {
          console.warn("[sub.renewal] payment-failed email failed (non-fatal)", String(err))
        }
        if (attempt >= DUNNING_MAX_ATTEMPTS) { await downgradeToFree(u.id); summary.downgraded++ }
        else summary.failed++
        continue
      }

      // no_authorization / skipped
      summary.skipped++
    } catch (err) {
      summary.errors.push({ userId: u.id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return summary
}
