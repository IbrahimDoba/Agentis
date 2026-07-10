import Link from "next/link"
import { getTrialState, isTrialPlan } from "@/lib/trial"
import { hasUsableWallet } from "@/lib/walletStatus"

// Soft "choose a plan" wall + trial countdown shown at the top of the dashboard
// for platform free users. Reseller/paid users render nothing (status "none").
export function TrialBanner({
  user,
}: {
  user: { plan: string | null; resellerId: string | null; subscriptionExpiresAt: Date | null; creditBalance?: number | null; creditsExpireAt?: Date | null }
}) {
  // getTrialState treats a usable PAYG wallet as "not gated", so a lapsed-trial
  // user who topped up sees no wall here.
  const state = getTrialState(user)

  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "12px 16px",
    marginBottom: 16,
    borderRadius: 10,
    fontSize: 14,
  }

  if (state.status === "expired") {
    return (
      <div style={{ ...row, background: "#dc2626", color: "#fff" }} role="alert">
        <span style={{ fontWeight: 600 }}>
          Your free trial has ended. Choose a plan to reactivate your agent and keep sending messages.
        </span>
        <Link
          href="/dashboard/subscription"
          style={{
            background: "#fff",
            color: "#dc2626",
            padding: "8px 14px",
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Choose a plan
        </Link>
      </div>
    )
  }

  // Trial deadline passed but a usable PAYG wallet is funding the agent —
  // getTrialState reports "none" for this case (no red wall). Show a calm,
  // positive strip instead of nothing, so the user knows what's powering sends.
  const lapsedOnWallet =
    state.status === "none" &&
    isTrialPlan(user.plan, user.resellerId) &&
    !!user.subscriptionExpiresAt &&
    new Date(user.subscriptionExpiresAt).getTime() <= Date.now() &&
    hasUsableWallet(user.creditBalance, user.creditsExpireAt)
  if (lapsedOnWallet) {
    const balance = (user.creditBalance ?? 0).toLocaleString()
    return (
      <div style={{ ...row, background: "#dcfce7", color: "#166534" }}>
        <span>
          💳 Running on <strong>Pay-as-you-go</strong> — {balance} credits left.
        </span>
        <Link
          href="/dashboard/credits"
          style={{ color: "#166534", fontWeight: 700, textDecoration: "underline", whiteSpace: "nowrap" }}
        >
          Top up
        </Link>
      </div>
    )
  }

  if (state.status === "active" && state.daysLeft <= 3) {
    return (
      <div style={{ ...row, background: "#f59e0b", color: "#1c1917" }}>
        <span>
          {state.daysLeft} day{state.daysLeft === 1 ? "" : "s"} left in your free trial.
        </span>
        <Link
          href="/dashboard/subscription"
          style={{ color: "#1c1917", fontWeight: 700, textDecoration: "underline", whiteSpace: "nowrap" }}
        >
          Upgrade now
        </Link>
      </div>
    )
  }

  return null
}
