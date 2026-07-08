import Link from "next/link"
import { getTrialState } from "@/lib/trial"

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
