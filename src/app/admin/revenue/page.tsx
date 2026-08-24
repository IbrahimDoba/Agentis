import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { RevenueDashboard } from "@/components/admin/RevenueDashboard"
import { toBase, type RateMap } from "@/lib/finance"
import { PLAN_PRICES, PLAN_LABELS } from "@/lib/plans"

// Admin Revenue tab. Live revenue collected via Paystack — every PAID
// SubscriptionCharge (plan payments) + CreditPurchase (credit top-ups),
// grouped by month — plus manual revenue lines (FinanceEntry kind=revenue).
// Read-only aggregation; the manual-add form posts to the shared finance
// entries API. Headline figure is GROSS collected; net-after-fees is secondary.
export default async function AdminRevenuePage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [subs, credits, revEntries, ratesRaw] = await Promise.all([
    db.subscriptionCharge.findMany({
      where: { status: "PAID" },
      select: { completedAt: true, amountNaira: true, netNaira: true, plan: true },
    }),
    db.creditPurchase.findMany({
      where: { status: "PAID" },
      select: { completedAt: true, amountNaira: true, netNaira: true },
    }),
    db.financeEntry.findMany({ where: { kind: "revenue" }, orderBy: { incurredAt: "desc" } }),
    db.financeFxRate.findMany(),
  ])

  const rates: RateMap = {}
  for (const r of ratesRaw) rates[r.currency] = Number(r.rateToBase)

  // ── Monthly buckets (last 12 months, oldest→newest) ──────────────────────
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  type Bucket = { key: string; label: string; subscriptions: number; credits: number; manual: number; total: number }
  const months: Bucket[] = []
  const idx: Record<string, number> = {}
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    idx[key(d)] = months.length
    months.push({
      key: key(d),
      label: d.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      subscriptions: 0, credits: 0, manual: 0, total: 0,
    })
  }
  const bucket = (when: Date | null, field: "subscriptions" | "credits" | "manual", amt: number) => {
    if (!when || amt <= 0) return
    const i = idx[key(when)]
    if (i !== undefined) { months[i][field] += amt; months[i].total += amt }
  }
  for (const s of subs) bucket(s.completedAt, "subscriptions", s.amountNaira)
  for (const c of credits) bucket(c.completedAt, "credits", c.amountNaira)
  for (const e of revEntries) {
    const b = toBase(e.amount, e.currency, rates)
    if (b !== null) bucket(e.incurredAt, "manual", b)
  }

  // ── Totals by source (gross = collected, net = after Paystack fees) ───────
  const subsGross = subs.reduce((a, s) => a + s.amountNaira, 0)
  const subsNet = subs.reduce((a, s) => a + s.netNaira, 0)
  const creditsGross = credits.reduce((a, c) => a + c.amountNaira, 0)
  const creditsNet = credits.reduce((a, c) => a + c.netNaira, 0)
  let manualTotal = 0
  let manualUnconverted = 0
  for (const e of revEntries) {
    const b = toBase(e.amount, e.currency, rates)
    if (b === null) { manualUnconverted++; continue }
    manualTotal += b
  }

  const inMonth = (d: Date | null) => !!d && d >= monthStart
  const monthGross =
    subs.filter((s) => inMonth(s.completedAt)).reduce((a, s) => a + s.amountNaira, 0) +
    credits.filter((c) => inMonth(c.completedAt)).reduce((a, c) => a + c.amountNaira, 0) +
    revEntries.reduce((a, e) => (inMonth(e.incurredAt) ? a + (toBase(e.amount, e.currency, rates) ?? 0) : a), 0)

  // ── Revenue by plan (from subscriptions) ─────────────────────────────────
  const byPlan: Record<string, number> = {}
  for (const s of subs) byPlan[s.plan] = (byPlan[s.plan] ?? 0) + s.amountNaira
  const planData = Object.entries(byPlan)
    .map(([plan, amount]) => ({ plan, label: PLAN_LABELS[plan] ?? plan, amount }))
    .sort((a, b) => b.amount - a.amount)

  // ── Manual entries (serialized, converted to NGN base) ───────────────────
  const manualEntries = revEntries.map((e) => ({
    id: e.id,
    label: e.label,
    amountNaira: toBase(e.amount, e.currency, rates) ?? 0,
    currency: e.currency,
    note: e.note,
    at: e.incurredAt.toISOString(),
    converted: toBase(e.amount, e.currency, rates) !== null,
  }))

  const plans = (["basic", "starter", "pro"] as const).map((p) => ({
    plan: p,
    label: PLAN_LABELS[p] ?? p,
    price: PLAN_PRICES[p] ?? 0,
  }))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Revenue</h1>
        <p className={styles.subtitle}>
          Live Paystack revenue collected &mdash; subscriptions &amp; credit purchases &mdash; plus manual entries (gross &#8358;)
        </p>
      </div>
      <RevenueDashboard
        totals={{
          totalGross: subsGross + creditsGross + manualTotal,
          totalNet: subsNet + creditsNet + manualTotal,
          monthGross,
          txnCount: subs.length + credits.length,
          subsGross, creditsGross, manualTotal,
        }}
        monthly={months}
        planData={planData}
        manualEntries={manualEntries}
        manualUnconverted={manualUnconverted}
        plans={plans}
        generatedAt={now.toISOString()}
      />
    </div>
  )
}
