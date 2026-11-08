// Pure, isomorphic (no db import) — shared by the admin Users list and the
// admin Analytics plan segments so the two can never disagree about who is on
// pay-as-you-go.
import { hasUsableWallet } from "@/lib/walletStatus"

export type UserBillingState = "reseller" | "payg" | "over_limit" | "expired" | "plan"

export const BILLING_STATE_LABELS: Record<UserBillingState, string> = {
  reseller: "Reseller",
  payg: "Pay as you go",
  over_limit: "Over limit",
  expired: "Expired",
  plan: "On plan",
}

export interface BillingStateInput {
  plan: string
  creditLimit: number // effective limit for the cycle; -1 = unlimited
  creditsUsed: number // this cycle, plan + wallet
  walletCreditsUsed: number // this cycle, rows the worker billed to the wallet
  creditBalance: number | null | undefined
  creditsExpireAt: string | Date | null | undefined
  subscriptionExpiresAt: string | Date | null | undefined
  now?: Date
}

export function getUserBillingState(input: BillingStateInput): UserBillingState {
  const now = input.now ?? new Date()
  // Reseller users have a 0 allowance by design — every send is wallet-funded,
  // so calling them "pay as you go" would bury them in that bucket.
  if (input.plan === "reseller") return "reseller"

  const walletUsable = hasUsableWallet(input.creditBalance, input.creditsExpireAt, now)
  const planExpired = input.subscriptionExpiresAt
    ? new Date(input.subscriptionExpiresAt).getTime() <= now.getTime()
    : false
  const unlimited = input.creditLimit === -1
  const exhausted = !unlimited && input.creditsUsed >= input.creditLimit

  // Spilling onto the wallet this cycle is the direct signal; a usable wallet
  // behind a lapsed or exhausted plan is about to be (the worker's routing).
  if (input.walletCreditsUsed > 0) return "payg"
  if (walletUsable && (planExpired || exhausted)) return "payg"
  if (exhausted) return "over_limit"
  if (planExpired && input.plan !== "free") return "expired"
  return "plan"
}
