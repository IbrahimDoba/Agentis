import { db } from "@/lib/db"
import { getBillingPeriod } from "@/lib/billing-period"
import { PLAN_CREDIT_LIMITS, effectiveCreditLimit } from "@/lib/plans"
import { getUserBillingState, type UserBillingState } from "@/lib/userBillingState"

export interface BillingUserRow {
  id: string
  plan: string | null
  subscriptionExpiresAt: Date | null
  currentPeriodStart: Date | null
  creditBalance: number | null
  creditsExpireAt: Date | null
  carryoverCredits: number | null
  carryoverExpiresAt: Date | null
}

export interface UserCycleBilling {
  creditsUsed: number
  walletCreditsUsed: number
  creditLimit: number
  state: UserBillingState
}

export const BILLING_USER_SELECT = {
  id: true,
  plan: true,
  subscriptionExpiresAt: true,
  currentPeriodStart: true,
  creditBalance: true,
  creditsExpireAt: true,
  carryoverCredits: true,
  carryoverExpiresAt: true,
} as const

/**
 * Current-cycle usage and billing state for many users in ONE query. Each user's
 * window comes from getBillingPeriod (the same one the worker gates on) and is
 * passed in as parallel arrays, so anchored cycles stay exact instead of being
 * approximated with a flat 30 days.
 */
export async function getCycleBillingForUsers(users: BillingUserRow[]): Promise<Map<string, UserCycleBilling>> {
  const result = new Map<string, UserCycleBilling>()
  if (users.length === 0) return result

  const now = new Date()
  const windows = users.map((u) => getBillingPeriod(u.subscriptionExpiresAt, u.currentPeriodStart))

  const rows = await db.$queryRawUnsafe<Array<{ userId: string; used: number; walletUsed: number }>>(
    `SELECT w.uid AS "userId",
            COALESCE(SUM(cu."creditsUsed"), 0)::int AS used,
            COALESCE(SUM(cu."creditsUsed") FILTER (WHERE cu."billedTo" = 'wallet'), 0)::int AS "walletUsed"
     FROM unnest($1::text[], $2::timestamptz[], $3::timestamptz[]) AS w(uid, s, e)
     JOIN "Agent" a ON a."userId" = w.uid
     JOIN "CreditUsage" cu ON cu."agentId" = a.id AND cu."createdAt" >= w.s AND cu."createdAt" < w.e
     GROUP BY w.uid`,
    users.map((u) => u.id),
    windows.map((w) => w.start.toISOString()),
    windows.map((w) => w.end.toISOString())
  )
  const usage = new Map(rows.map((r) => [r.userId, r]))

  for (const u of users) {
    const plan = u.plan ?? "free"
    const row = usage.get(u.id)
    const creditsUsed = Number(row?.used ?? 0)
    const walletCreditsUsed = Number(row?.walletUsed ?? 0)
    const creditLimit = effectiveCreditLimit(
      PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free,
      u.carryoverCredits,
      u.carryoverExpiresAt,
      now
    )
    result.set(u.id, {
      creditsUsed,
      walletCreditsUsed,
      creditLimit,
      state: getUserBillingState({
        plan,
        creditLimit,
        creditsUsed,
        walletCreditsUsed,
        creditBalance: u.creditBalance,
        creditsExpireAt: u.creditsExpireAt,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
        now,
      }),
    })
  }
  return result
}
