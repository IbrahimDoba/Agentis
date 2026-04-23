"use client"

import Link from "next/link"
import { usePlanStats } from "@/hooks/usePlanStats"
import { PLAN_LABELS, PLAN_PRICES, PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K, formatNaira } from "@/lib/plans"
import { formatDate } from "@/lib/utils"
import styles from "./page.module.css"

function StatRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  )
}

export default function BillingPage() {
  const { data: stats, isLoading } = usePlanStats()

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Subscription &amp; Usage</h1>
          <p className={styles.subtitle}>Loading your plan details…</p>
        </div>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} style={{ height: 180 }} />
      </div>
    )
  }

  const plan = stats?.plan ?? "free"
  const planLabel = PLAN_LABELS[plan] ?? plan
  const price = PLAN_PRICES[plan] ?? 0
  const creditLimit = stats?.creditLimit ?? PLAN_CREDIT_LIMITS[plan] ?? 2000
  const unlimited = creditLimit === -1
  const overageRate = PLAN_OVERAGE_RATE_PER_1K[plan] ?? null

  const monthlyUsed = stats?.monthlyCreditsUsed ?? 0
  const totalUsed = stats?.totalCreditsUsed ?? 0
  const pct = unlimited ? 0 : creditLimit > 0 ? Math.min(100, Math.round((monthlyUsed / creditLimit) * 100)) : 0
  const remaining = unlimited ? null : Math.max(0, creditLimit - monthlyUsed)
  const overageCredits = unlimited ? 0 : Math.max(0, monthlyUsed - creditLimit)
  const overageCharge = overageRate !== null && overageCredits > 0
    ? Math.ceil(overageCredits / 1000) * overageRate
    : null

  const isWarning = !unlimited && pct >= 75
  const isDanger = !unlimited && pct >= 90
  const isExhausted = !unlimited && monthlyUsed >= creditLimit

  const expiry = stats?.subscriptionExpiresAt
  const isExpired = expiry ? new Date() > new Date(expiry) : false

  const monthName = new Date().toLocaleString("default", { month: "long", year: "numeric" })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Subscription &amp; Usage</h1>
        <p className={styles.subtitle}>Your current plan and credit usage for {monthName}.</p>
      </div>

      <div className={styles.grid}>

        {/* Plan card */}
        <div className={styles.planCard}>
          <div className={styles.planCardTop}>
            <div>
              <div className={styles.planBadge} data-plan={plan}>{planLabel}</div>
              <div className={styles.planPrice}>
                {price > 0 ? `${formatNaira(price)}/mo` : "Free"}
              </div>
            </div>
            <Link href="/dashboard/subscription" className={styles.upgradeBtn}>
              {plan === "free" ? "Upgrade" : "View plans"} →
            </Link>
          </div>

          <div className={styles.planDetails}>
            <StatRow
              label="Monthly credits"
              value={unlimited ? "Unlimited" : `${creditLimit.toLocaleString()} cr`}
            />
            {overageRate !== null && (
              <StatRow
                label="Overage rate"
                value={`${formatNaira(overageRate)} / 1,000 credits`}
              />
            )}
            {expiry && (
              <StatRow
                label={isExpired ? "Expired on" : "Renews"}
                value={
                  <span className={isExpired ? styles.expiredText : styles.renewText}>
                    {formatDate(new Date(expiry).toISOString())}
                  </span>
                }
              />
            )}
          </div>
        </div>

        {/* Usage card */}
        <div className={`${styles.usageCard} ${isDanger ? styles.usageCardDanger : isWarning ? styles.usageCardWarning : ""}`}>
          <div className={styles.usageCardTitle}>⚡ Credits used this month</div>

          <div className={styles.usageBig}>
            <span className={styles.usageBigNum}>{monthlyUsed.toLocaleString()}</span>
            {!unlimited && <span className={styles.usageBigOf}>/ {creditLimit.toLocaleString()}</span>}
            {unlimited && <span className={styles.usageBigOf}>credits</span>}
          </div>

          {!unlimited && (
            <>
              <div className={styles.barTrack}>
                <div
                  className={`${styles.barFill} ${isDanger ? styles.barDanger : isWarning ? styles.barWarning : ""}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={styles.usageMeta}>
                <span className={`${styles.usagePct} ${isDanger ? styles.textDanger : isWarning ? styles.textWarning : ""}`}>
                  {pct}% used
                </span>
                <span className={styles.usageRemaining}>
                  {isExhausted ? "Limit reached" : `${remaining?.toLocaleString()} remaining`}
                </span>
              </div>
            </>
          )}

          {unlimited && (
            <p className={styles.unlimitedNote}>Unlimited plan — no credit cap.</p>
          )}
        </div>

        {/* Overage card (only show if overdue) */}
        {overageCredits > 0 && (
          <div className={styles.overageCard}>
            <div className={styles.overageTitle}>⚠ Overage this month</div>
            <div className={styles.overageBig}>{overageCredits.toLocaleString()} <span>credits over limit</span></div>
            {overageCharge !== null && (
              <div className={styles.overageCharge}>
                <span className={styles.overageChargeLabel}>Amount due</span>
                <span className={styles.overageChargeValue}>{formatNaira(overageCharge)}</span>
              </div>
            )}
            <p className={styles.overageNote}>
              Overage is active on your plan. Your agent keeps running and this amount is billable.
            </p>
          </div>
        )}

        {/* All-time stats */}
        <div className={styles.allTimeCard}>
          <div className={styles.allTimeTitle}>All-time usage</div>
          <div className={styles.allTimeBig}>{totalUsed.toLocaleString()}</div>
          <div className={styles.allTimeSub}>total credits consumed</div>
        </div>

      </div>
    </div>
  )
}
