"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePlanStats } from "@/hooks/usePlanStats"
import {
  PLAN_LABELS, PLAN_PRICES, PLAN_CREDIT_LIMITS,
  PLAN_FEATURES, PLAN_ORDER, isPlanUpgrade, isPlanDowngrade, PLAN_OVERAGE_RATE_PER_1K,
  CREDITS_NOTE, estimatedAiMessages, formatNaira
} from "@/lib/plans"
import { PAYG_DEFAULT_NGN_PER_CREDIT } from "@/lib/credits"
import { useBrand } from "@/components/BrandProvider"
import styles from "./page.module.css"

interface SubStatus {
  plan: string
  subscriptionExpiresAt: string | null
  subscriptionStatus: string
  autoRenew: boolean
  cancelAtPeriodEnd: boolean
  pendingPlan: string | null
  card: { last4: string; brand: string | null; expiry: string | null } | null
}

const PLAN_POPULAR: Record<string, boolean> = { basic: false, starter: false, pro: true }

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })
}

export default function SubscriptionPage() {
  const brand = useBrand()
  const { data: stats, isLoading, refetch: refetchStats } = usePlanStats()
  const [sub, setSub] = useState<SubStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const loadSub = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription/status")
      if (res.ok) setSub(await res.json())
    } catch { /* non-fatal */ }
  }, [])

  // On return from Paystack checkout (?ref=…), reconcile the charge in case the
  // webhook is delayed, then clean the URL and refresh.
  useEffect(() => {
    void loadSub()
    const params = new URLSearchParams(window.location.search)
    const ref = params.get("ref")
    if (!ref) return
    setNotice("Confirming your payment…")
    fetch(`/api/subscription/verify?ref=${encodeURIComponent(ref)}`)
      .then((r) => r.json())
      .then((d) => {
        setNotice(d.status === "success" ? "🎉 Subscription active — thank you!" : "Payment is still processing. We'll update automatically once confirmed.")
        window.history.replaceState({}, "", "/dashboard/subscription")
        void loadSub()
        void refetchStats()
      })
      .catch(() => setNotice(""))
  }, [loadSub, refetchStats])

  const currentPlan = stats?.plan ?? sub?.plan ?? "free"
  const monthlyUsed = stats?.monthlyCreditsUsed ?? 0
  const limit = stats?.creditLimit ?? -1
  const overageRateForCurrent = PLAN_OVERAGE_RATE_PER_1K[currentPlan] ?? null
  const overageCreditsForCurrent = limit === -1 ? 0 : Math.max(0, monthlyUsed - limit)
  const overageChargeForCurrent = overageRateForCurrent !== null && overageCreditsForCurrent > 0
    ? Math.ceil(overageCreditsForCurrent / 1000) * overageRateForCurrent
    : 0
  const overageActive = overageCreditsForCurrent > 0 && overageRateForCurrent !== null

  const choosePlan = async (plan: string) => {
    setBusy(plan); setError(""); setNotice("")
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Something went wrong")
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl // → Paystack hosted checkout
        return
      }
      if (data.activated) { setNotice(`🎉 You're now on ${PLAN_LABELS[plan]}.`); await loadSub(); await refetchStats() }
      else if (data.scheduled) { setNotice(`Downgrade to ${PLAN_LABELS[plan]} scheduled for ${fmtDate(data.effectiveAt)}.`); await loadSub() }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  const postAction = async (key: string, url: string, okMsg: string) => {
    setBusy(key); setError(""); setNotice("")
    try {
      const res = await fetch(url, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Something went wrong")
      if (data.authorizationUrl) { window.location.href = data.authorizationUrl; return }
      setNotice(okMsg); await loadSub(); await refetchStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}><h1 className={styles.title}>Subscription Plans</h1></div>
        <div className={styles.skeletonGrid}>{[1, 2, 3, 4].map((i) => <div key={i} className={styles.skeleton} />)}</div>
      </div>
    )
  }

  const isPaid = currentPlan !== "free" && currentPlan !== "enterprise"
  const statusBadge = sub?.subscriptionStatus === "past_due" ? { text: "Payment failed", color: "#dc2626" }
    : sub?.cancelAtPeriodEnd ? { text: "Cancels at period end", color: "#d97706" }
    : sub?.subscriptionStatus === "active" ? { text: "Active", color: "#16a34a" }
    : null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Subscription Plans</h1>
        <p className={styles.subtitle}>Choose the plan that fits your business. Upgrade or downgrade anytime.</p>
      </div>

      {notice && <div className={styles.pendingBanner}><span>{notice}</span></div>}
      {error && <div className={styles.errorBanner}>{error}</div>}
      {overageActive && (
        <div className={styles.overageBanner}>
          Overage active on your current plan: {overageCreditsForCurrent.toLocaleString()} credits over limit
          ({formatNaira(overageChargeForCurrent)} accrued, billed at your next renewal). Service remains active.
        </div>
      )}

      {/* Current subscription management */}
      {isPaid && (
        <div style={{ border: "1px solid var(--border, #e4e4e7)", borderRadius: 12, padding: 20, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong style={{ fontSize: 16 }}>{PLAN_LABELS[currentPlan]} plan</strong>
              {statusBadge && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: statusBadge.color, borderRadius: 999, padding: "2px 10px" }}>{statusBadge.text}</span>
              )}
            </div>
            <div style={{ color: "var(--text-secondary, #6b7280)", fontSize: 13, marginTop: 6 }}>
              {sub?.cancelAtPeriodEnd
                ? <>Access until <strong>{fmtDate(sub?.subscriptionExpiresAt ?? null)}</strong>, then moves to Free.</>
                : sub?.autoRenew
                  ? <>Auto-renews on <strong>{fmtDate(sub?.subscriptionExpiresAt ?? null)}</strong></>
                  : <>Expires <strong>{fmtDate(sub?.subscriptionExpiresAt ?? null)}</strong></>}
              {sub?.card && <> · Card on file •••• {sub.card.last4}{sub.card.expiry ? ` (exp ${sub.card.expiry})` : ""}</>}
              {sub?.pendingPlan && <> · Scheduled change to <strong>{PLAN_LABELS[sub.pendingPlan]}</strong> at renewal</>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={styles.contactBtn} disabled={busy !== null} onClick={() => postAction("updateCard", "/api/subscription/update-card", "Redirecting…")}>
              {sub?.card ? "Update card" : "Add card"}
            </button>
            {sub?.cancelAtPeriodEnd || !sub?.autoRenew ? (
              <button className={styles.upgradeBtn} disabled={busy !== null} onClick={() => postAction("resume", "/api/subscription/resume", "Auto-renew re-enabled.")}>
                Resume auto-renew
              </button>
            ) : (
              <button className={styles.contactBtn} disabled={busy !== null} onClick={() => postAction("cancel", "/api/subscription/cancel", "Auto-renew turned off. You keep access until period end.")}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.grid}>
        {PLAN_ORDER.map((plan) => {
          const isCurrent = plan === currentPlan
          const isPopular = PLAN_POPULAR[plan]
          const price = PLAN_PRICES[plan] ?? 0
          const planLimit = PLAN_CREDIT_LIMITS[plan]
          const unlimited = planLimit === -1
          const features = PLAN_FEATURES[plan] ?? []
          const overageRate = PLAN_OVERAGE_RATE_PER_1K[plan]
          const isEnterprise = plan === "enterprise"
          // A currentPlan off the ladder (reseller) is not comparable to
          // anything here, so neither label applies — it used to rank as -1 and
          // paint every card "Upgrade".
          const isUpgrade = isPlanUpgrade(currentPlan, plan)
          const isDowngrade = isPlanDowngrade(currentPlan, plan) && plan !== "free"

          return (
            <div key={plan} className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ""} ${isPopular ? styles.planCardPopular : ""}`}>
              {isPopular && <div className={styles.popularBadge}>Most Popular</div>}
              <div className={styles.planTop}>
                <div className={styles.planName} data-plan={plan}>{PLAN_LABELS[plan]}</div>
                <div className={styles.planPrice}>
                  {isEnterprise ? <span className={styles.planPriceCustom}>Custom</span>
                    : price > 0 ? <><span className={styles.planPriceNum}>{formatNaira(price)}</span><span className={styles.planPricePer}>/mo</span></>
                    : <span className={styles.planPriceNum}>Free</span>}
                </div>
                <div className={styles.planCredits}>{unlimited ? "Unlimited credits" : `${(planLimit ?? 0).toLocaleString()} credits/mo`}</div>
                <div className={styles.planMessages}>
                  {unlimited ? "Unlimited AI messages" : `≈ ${estimatedAiMessages(planLimit ?? 0)!.toLocaleString()} AI messages/mo`}
                </div>
                {overageRate !== null && !isEnterprise && <div className={styles.planOverage}>Overage: {formatNaira(overageRate)} / 1k cr</div>}
              </div>

              <ul className={styles.featureList}>
                {features.map((f) => <li key={f} className={styles.featureItem}><span className={styles.featureCheck}>✓</span>{f}</li>)}
              </ul>

              <div className={styles.planAction}>
                {isCurrent ? (
                  <div className={styles.currentPlanBtn}>Current Plan</div>
                ) : isEnterprise ? (
                  <a href="mailto:hello@dzeroai.com" className={styles.contactBtn}>Contact Sales</a>
                ) : isUpgrade ? (
                  <button className={`${styles.upgradeBtn} ${isPopular ? styles.upgradeBtnPopular : ""}`} onClick={() => choosePlan(plan)} disabled={busy !== null}>
                    {busy === plan ? "Processing…" : `Upgrade to ${PLAN_LABELS[plan]}`}
                  </button>
                ) : isDowngrade ? (
                  <button className={styles.contactBtn} onClick={() => choosePlan(plan)} disabled={busy !== null}>
                    {busy === plan ? "Scheduling…" : `Switch to ${PLAN_LABELS[plan]}`}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.paygCard}>
        <div className={styles.paygText}>
          <div className={styles.paygTitle}>Pay as you go</div>
          <div className={styles.paygDesc}>
            No subscription needed — top up your credit wallet from ₦{PAYG_DEFAULT_NGN_PER_CREDIT.toFixed(2)}/credit (cheaper in bulk), valid 12 months. Wallet credits are used only after your plan&apos;s monthly allowance runs out.
          </div>
        </div>
        <Link href="/dashboard/credits" className={styles.paygBtn}>Buy Credits</Link>
      </div>

      <div className={styles.footer}>
        All plans include the {brand.appName} WhatsApp AI agent, conversation logs, and lead detection.
        {" "}{CREDITS_NOTE}
      </div>
    </div>
  )
}
