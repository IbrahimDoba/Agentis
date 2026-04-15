"use client"

import { useState, useEffect } from "react"
import { usePlanStats } from "@/hooks/usePlanStats"
import {
  PLAN_LABELS, PLAN_PRICES, PLAN_CREDIT_LIMITS,
  PLAN_FEATURES, PLAN_ORDER, PLAN_OVERAGE_RATE_PER_1K, formatNaira
} from "@/lib/plans"
import styles from "./page.module.css"

interface PaymentRequest {
  id: string
  reference: string
  plan: string
  amountNaira: number
  status: string
  createdAt: string
}

const PLAN_POPULAR: Record<string, boolean> = {
  starter: false,
  pro: true,
}

export default function SubscriptionPage() {
  const { data: stats, isLoading } = usePlanStats()
  const [pendingRequest, setPendingRequest] = useState<PaymentRequest | null>(null)
  const [requesting, setRequesting] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<PaymentRequest | null>(null)
  const [error, setError] = useState("")

  const currentPlan = stats?.plan ?? "free"

  useEffect(() => {
    fetch("/api/subscription/request")
      .then((r) => r.json())
      .then((data: PaymentRequest[]) => {
        const pending = data.find((r) => r.status === "PENDING")
        if (pending) setPendingRequest(pending)
      })
      .catch(() => {})
  }, [])

  const handleRequest = async (plan: string) => {
    setRequesting(plan)
    setError("")
    try {
      const res = await fetch("/api/subscription/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      if (!res.ok) throw new Error("Failed")
      const data: PaymentRequest = await res.json()
      setSubmitted(data)
      setPendingRequest(data)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setRequesting(null)
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Subscription Plans</h1>
        </div>
        <div className={styles.skeletonGrid}>
          {[1,2,3,4].map((i) => <div key={i} className={styles.skeleton} />)}
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Request Submitted</h1>
          <p className={styles.subtitle}>We&apos;ve received your upgrade request.</p>
        </div>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>✓</div>
          <div className={styles.successTitle}>Upgrade to {PLAN_LABELS[submitted.plan]} requested</div>
          <div className={styles.successAmount}>{formatNaira(submitted.amountNaira)}<span>/month</span></div>
          <div className={styles.successRef}>
            <span className={styles.successRefLabel}>Reference</span>
            <span className={styles.successRefValue}>{submitted.reference}</span>
          </div>
          <div className={styles.successInstructions}>
            <div className={styles.successInstructionsTitle}>Next steps</div>
            <p>Our team will reach out to you shortly with payment details. Once payment is confirmed, your plan will be activated automatically.</p>
            <p>Quote your reference number in all payment communications.</p>
          </div>
          <button className={styles.successBack} onClick={() => setSubmitted(null)}>
            Back to plans
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Subscription Plans</h1>
        <p className={styles.subtitle}>Choose the plan that fits your business. Upgrade or downgrade anytime.</p>
      </div>

      {pendingRequest && (
        <div className={styles.pendingBanner}>
          <span className={styles.pendingDot} />
          <span>
            You have a pending upgrade request to <strong>{PLAN_LABELS[pendingRequest.plan]}</strong> — ref <code>{pendingRequest.reference}</code>.
            Our team will be in touch shortly.
          </span>
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.grid}>
        {PLAN_ORDER.map((plan) => {
          const isCurrent = plan === currentPlan
          const isPopular = PLAN_POPULAR[plan]
          const price = PLAN_PRICES[plan] ?? 0
          const limit = PLAN_CREDIT_LIMITS[plan]
          const unlimited = limit === -1
          const features = PLAN_FEATURES[plan] ?? []
          const overageRate = PLAN_OVERAGE_RATE_PER_1K[plan]
          const isEnterprise = plan === "enterprise"
          const planIndex = PLAN_ORDER.indexOf(plan)
          const currentIndex = PLAN_ORDER.indexOf(currentPlan)
          const isUpgrade = planIndex > currentIndex
          const isDowngrade = planIndex < currentIndex

          return (
            <div
              key={plan}
              className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ""} ${isPopular ? styles.planCardPopular : ""}`}
            >
              {isPopular && <div className={styles.popularBadge}>Most Popular</div>}

              <div className={styles.planTop}>
                <div className={styles.planName} data-plan={plan}>{PLAN_LABELS[plan]}</div>
                <div className={styles.planPrice}>
                  {isEnterprise ? (
                    <span className={styles.planPriceCustom}>Custom</span>
                  ) : price > 0 ? (
                    <>
                      <span className={styles.planPriceNum}>{formatNaira(price)}</span>
                      <span className={styles.planPricePer}>/mo</span>
                    </>
                  ) : (
                    <span className={styles.planPriceNum}>Free</span>
                  )}
                </div>
                <div className={styles.planCredits}>
                  {unlimited ? "Unlimited credits" : `${(limit ?? 0).toLocaleString()} credits/mo`}
                </div>
                {overageRate !== null && !isEnterprise && (
                  <div className={styles.planOverage}>Overage: {formatNaira(overageRate)} / 1k cr</div>
                )}
              </div>

              <ul className={styles.featureList}>
                {features.map((f) => (
                  <li key={f} className={styles.featureItem}>
                    <span className={styles.featureCheck}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className={styles.planAction}>
                {isCurrent ? (
                  <div className={styles.currentPlanBtn}>Current Plan</div>
                ) : isEnterprise ? (
                  <a href="mailto:hello@dzeroai.com" className={styles.contactBtn}>
                    Contact Sales
                  </a>
                ) : isUpgrade ? (
                  <button
                    className={`${styles.upgradeBtn} ${isPopular ? styles.upgradeBtnPopular : ""}`}
                    onClick={() => handleRequest(plan)}
                    disabled={requesting === plan || (!!pendingRequest && pendingRequest.plan !== plan)}
                  >
                    {requesting === plan ? "Submitting…" : `Upgrade to ${PLAN_LABELS[plan]}`}
                  </button>
                ) : isDowngrade ? (
                  <a href="mailto:hello@dzeroai.com" className={styles.contactBtn}>
                    Contact us to downgrade
                  </a>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        All plans include a WhatsApp AI voice agent, conversation logs, and lead detection.
        Credits are ElevenLabs conversation credits — usage varies by call duration and voice quality.
      </div>
    </div>
  )
}
