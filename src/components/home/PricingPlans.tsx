"use client"
import { useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { ANNUAL_MONTHS_CHARGED, formatNaira } from "@/lib/plans"
import { Reveal } from "./Reveal"
import styles from "./Home.module.css"

export interface PlanView {
  id: string
  name: string
  desc: string
  popular?: boolean
  naira: number
  usd: number
  lines: string[]
}

type Cycle = "monthly" | "yearly"

// Checkout only charges monthly today. The switch stays hidden until yearly
// checkout ships, so the page never shows a price nobody can pay.
const YEARLY_CHECKOUT_LIVE = false

export function PricingPlans({ plans }: { plans: PlanView[] }) {
  const [cycle, setCycle] = useState<Cycle>("monthly")
  const months = cycle === "yearly" ? ANNUAL_MONTHS_CHARGED : 1

  return (
    <>
      {YEARLY_CHECKOUT_LIVE && <div className={styles.cycle} role="radiogroup" aria-label="Billing period">
        {(["monthly", "yearly"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cycle === c}
            className={styles.cycleBtn}
            onClick={() => setCycle(c)}
          >
            {c === "monthly" ? "Monthly" : "Yearly"}
            {c === "yearly" && <span className={styles.cycleSave}>2 months free</span>}
          </button>
        ))}
      </div>}

      <Reveal className={styles.plans}>
        {plans.map((plan) => (
          <div key={plan.id} className={`${styles.plan} ${plan.popular ? styles.planPro : ""}`}>
            {plan.popular && <span className={styles.planBadge}>Most popular</span>}
            <div className={styles.planName}>{plan.name}</div>
            <div className={styles.planPrice}>
              {formatNaira(plan.naira * months)}
              <span> / {cycle === "yearly" ? "year" : "month"}</span>
            </div>
            <div className={styles.planUsd}>
              about ${(plan.usd * months).toLocaleString("en-US")}
              {cycle === "yearly" && <> · {formatNaira(Math.round(plan.naira * months / 12))} a month</>}
            </div>
            <p className={styles.planDesc}>{plan.desc}</p>
            <ul className={styles.planList}>
              {plan.lines.map((f) => <li key={f} className={styles.planItem}><Check size={14} aria-hidden="true" />{f}</li>)}
            </ul>
            <Link href="/signup" className={`${styles.planBtn} ${plan.popular ? styles.planBtnSolid : ""}`}>Start free trial</Link>
          </div>
        ))}
      </Reveal>
    </>
  )
}
