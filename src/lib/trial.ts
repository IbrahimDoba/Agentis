// Free-trial helpers.
//
// On the platform (Dailzero) tenant, the "free" plan is a time-boxed trial: it
// starts when the user first connects WhatsApp and runs for TRIAL_DAYS, after
// which the dashboard shows a soft "choose a plan" wall and the agent stops
// replying (the worker already rejects AI sends once subscriptionExpiresAt is
// in the past). The trial deadline is stored in the existing
// `User.subscriptionExpiresAt` column — no separate field.
//
// Reseller-tenant users (plan "reseller", whose credits come from the
// reseller's pool) and paid users are NEVER trial-gated.

export const TRIAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

import { hasUsableWallet } from "@/lib/walletStatus"

type TrialUser = {
  plan: string | null | undefined
  resellerId: string | null | undefined
  subscriptionExpiresAt: Date | string | null | undefined
  // Optional PAYG wallet — when present and usable, a lapsed trial is NOT gated
  // (the wallet funds sends). Callers that enforce the gate must select these.
  creditBalance?: number | null
  creditsExpireAt?: Date | string | null
}

/** Is this user on the platform free-trial regime (vs paid / reseller)? */
export function isTrialPlan(
  plan: string | null | undefined,
  resellerId: string | null | undefined
): boolean {
  return (plan ?? "free") === "free" && (resellerId ?? "platform") === "platform"
}

/** The trial deadline for a trial that starts at `start`. */
export function trialDeadlineFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS)
}

export type TrialState =
  | { status: "none" } // not on the trial regime (paid / reseller)
  | { status: "pending" } // free user who hasn't started the trial yet (no deadline)
  | { status: "active"; endsAt: Date; daysLeft: number }
  | { status: "expired"; endsAt: Date }

export function getTrialState(user: TrialUser): TrialState {
  if (!isTrialPlan(user.plan, user.resellerId)) return { status: "none" }
  if (!user.subscriptionExpiresAt) return { status: "pending" }
  const endsAt = new Date(user.subscriptionExpiresAt)
  const now = Date.now()
  if (now > endsAt.getTime()) {
    // Trial deadline passed — but a usable PAYG wallet keeps the user sending,
    // so they're no longer trial-gated (no soft wall, no send block).
    if (hasUsableWallet(user.creditBalance, user.creditsExpireAt, new Date(now))) return { status: "none" }
    return { status: "expired", endsAt }
  }
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now) / DAY_MS))
  return { status: "active", endsAt, daysLeft }
}

/** True once a platform free user's trial deadline has passed (the soft wall). */
export function isFreeTrialExpired(user: TrialUser): boolean {
  return getTrialState(user).status === "expired"
}
