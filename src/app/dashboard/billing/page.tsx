"use client"

import Link from "next/link"
import { usePlanStats, type PlanStats } from "@/hooks/usePlanStats"
import { PLAN_LABELS, PLAN_PRICES, PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K, formatNaira } from "@/lib/plans"
import { hasUsableWallet, paygTakeover } from "@/lib/walletStatus"
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

// Reseller-tenant users don't self-pay. They run on credits their provider
// granted from her pool (the PAYG wallet), so they get a read-only view of
// their plan: credits remaining + validity, with no buy/upgrade controls.
function ResellerBilling({ stats }: { stats: PlanStats }) {
  const credits = stats.creditBalance ?? 0
  const exp = stats.creditsExpireAt ?? stats.subscriptionExpiresAt
  // Only "expired" when there are no usable credits left.
  const expired = (exp ? new Date() > new Date(exp) : false) && !hasUsableWallet(credits, exp)
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My plan</h1>
        <p className={styles.subtitle}>Your credits and plan validity.</p>
      </div>
      <div className={styles.grid}>
        <div className={styles.planCard}>
          <div className={styles.planCardTop}>
            <div>
              <div className={styles.planBadge}>Active plan</div>
              <div className={styles.planPrice}>{credits.toLocaleString()} credits left</div>
            </div>
          </div>
          <div className={styles.planDetails}>
            <StatRow label="Credits remaining" value={`${credits.toLocaleString()} cr`} />
            {exp && (
              <StatRow
                label={expired ? "Expired on" : "Valid until"}
                value={<span className={expired ? styles.expiredText : styles.renewText}>{formatDate(new Date(exp).toISOString())}</span>}
              />
            )}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)", marginTop: 16 }}>
        Your plan is managed by your provider. To top up credits or renew, please contact them.
        {expired && " Your AI agent has paused until your plan is renewed."}
      </p>
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

  if (stats?.isReseller) {
    return <ResellerBilling stats={stats} />
  }

  const plan = stats?.plan ?? "free"
  const planLabel = PLAN_LABELS[plan] ?? plan
  const price = PLAN_PRICES[plan] ?? 0
  const creditLimit = stats?.creditLimit ?? PLAN_CREDIT_LIMITS[plan] ?? 1000
  const unlimited = creditLimit === -1
  const overageRate = PLAN_OVERAGE_RATE_PER_1K[plan] ?? null

  const monthlyUsed = stats?.monthlyCreditsUsed ?? 0
  const monthlyAiCredits = stats?.monthlyAiCredits ?? 0
  const monthlyHumanCredits = stats?.monthlyHumanCredits ?? 0
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
  // A usable PAYG wallet keeps the agent sending past the plan date, so don't
  // show the alarming "Expired" state — the wallet is funding the service.
  const isExpired = (expiry ? new Date() > new Date(expiry) : false)
    && !hasUsableWallet(stats?.creditBalance, stats?.creditsExpireAt)

  // PAYG wallet numbers. When the wallet is what's funding sends (plan expired
  // or allowance finished), the usage card switches to the pay-as-you-go meter:
  // fill grows left→right with wallet usage; remaining = current balance.
  const walletBalance = stats?.creditBalance ?? 0
  const walletUsed = stats?.walletUsed ?? 0
  const walletTotal = walletUsed + walletBalance
  const walletPct = walletTotal > 0 ? Math.min(100, Math.round((walletUsed / walletTotal) * 100)) : 0
  const walletExp = stats?.creditsExpireAt ? new Date(stats.creditsExpireAt) : null
  const paygActive = paygTakeover({
    creditBalance: walletBalance,
    creditsExpireAt: stats?.creditsExpireAt,
    subscriptionExpiresAt: expiry,
    monthlyCreditsUsed: monthlyUsed,
    creditLimit,
  })

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
            <div className={styles.planCardActions}>
              <Link href="/dashboard/credits" className={styles.upgradeBtn}>
                Buy credits →
              </Link>
              <Link href="/dashboard/subscription" className={styles.upgradeBtn}>
                {plan === "free" ? "Upgrade" : "View plans"} →
              </Link>
            </div>
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
            {walletBalance > 0 && (
              <StatRow
                label="💳 Pay-as-you-go wallet"
                value={<span style={{ color: "#16a34a", fontWeight: 700 }}>{walletBalance.toLocaleString()} cr</span>}
                sub={walletExp ? `valid until ${formatDate(walletExp.toISOString())}` : undefined}
              />
            )}
          </div>
        </div>

        {/* Usage card — switches to the PAYG meter when the wallet is funding sends */}
        {paygActive ? (
          <div className={styles.usageCard}>
            <div className={styles.usageCardTitle}>💳 Pay-as-you-go credits</div>

            <div className={styles.usageBig}>
              <span className={styles.usageBigNum}>{walletUsed.toLocaleString()}</span>
              <span className={styles.usageBigOf}>/ {walletTotal.toLocaleString()} used</span>
            </div>

            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${walletPct}%`, background: "#16a34a" }} />
            </div>
            <div className={styles.usageMeta}>
              <span className={styles.usagePct} style={{ color: "#16a34a" }}>{walletPct}% used</span>
              <span className={styles.usageRemaining}>{walletBalance.toLocaleString()} remaining</span>
            </div>

            <p className={styles.unlimitedNote}>
              {isExhausted && !(expiry && new Date() > new Date(expiry))
                ? "Your plan allowance for this month is finished — usage now draws from your wallet."
                : "Your plan has lapsed — your wallet credits are keeping the agent running."}
              {walletExp ? ` Wallet valid until ${formatDate(walletExp.toISOString())}.` : ""}
            </p>
          </div>
        ) : (
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

          {(monthlyAiCredits > 0 || monthlyHumanCredits > 0) && (
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>🤖 AI messages</span>
                <span className={styles.breakdownValue}>{monthlyAiCredits.toLocaleString()} cr</span>
              </div>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>👤 Team messages</span>
                <span className={styles.breakdownValue}>{monthlyHumanCredits.toLocaleString()} cr</span>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Overage removed platform-wide — this card only renders if a plan ever
            re-enables an overage rate. With all rates null it never shows;
            exceeding the allowance now draws the PAYG wallet or stops. */}
        {overageRate !== null && overageCredits > 0 && (
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
