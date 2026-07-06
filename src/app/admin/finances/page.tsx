import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { FinancesDashboard } from "@/components/admin/FinancesDashboard"
import type { FinanceEntryDTO, RateMap } from "@/lib/finance"

// Admin finance tracker. Manual expense/revenue P&L (base currency NGN) plus a
// read-only "actual revenue collected" reference pulled from real PAID rows.
export default async function AdminFinancesPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [entriesRaw, ratesRaw, subsAll, creditsAll, subsMonth, creditsMonth] = await Promise.all([
    db.financeEntry.findMany({ orderBy: { incurredAt: "desc" } }),
    db.financeFxRate.findMany(),
    db.subscriptionCharge.aggregate({ where: { status: "PAID" }, _sum: { amountNaira: true, netNaira: true } }),
    db.creditPurchase.aggregate({ where: { status: "PAID" }, _sum: { amountNaira: true, netNaira: true } }),
    db.subscriptionCharge.aggregate({ where: { status: "PAID", completedAt: { gte: monthStart } }, _sum: { amountNaira: true, netNaira: true } }),
    db.creditPurchase.aggregate({ where: { status: "PAID", completedAt: { gte: monthStart } }, _sum: { amountNaira: true, netNaira: true } }),
  ])

  const entries: FinanceEntryDTO[] = entriesRaw.map((e) => ({
    id: e.id,
    kind: e.kind === "revenue" ? "revenue" : "expense",
    label: e.label,
    amount: e.amount,
    currency: e.currency,
    recurring: e.recurring,
    note: e.note,
    incurredAt: e.incurredAt.toISOString(),
  }))

  const rates: RateMap = {}
  for (const r of ratesRaw) rates[r.currency] = Number(r.rateToBase)

  // "Actual revenue collected" reference (all NGN, from real PAID rows).
  const actualRevenue = {
    allTime: {
      gross: (subsAll._sum.amountNaira ?? 0) + (creditsAll._sum.amountNaira ?? 0),
      net: (subsAll._sum.netNaira ?? 0) + (creditsAll._sum.netNaira ?? 0),
    },
    thisMonth: {
      gross: (subsMonth._sum.amountNaira ?? 0) + (creditsMonth._sum.amountNaira ?? 0),
      net: (subsMonth._sum.netNaira ?? 0) + (creditsMonth._sum.netNaira ?? 0),
    },
    subscriptionsNet: subsAll._sum.netNaira ?? 0,
    creditsNet: creditsAll._sum.netNaira ?? 0,
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Finances</h1>
        <p className={styles.subtitle}>Manual expenses &amp; revenue · profit tracking (base ₦)</p>
      </div>
      <FinancesDashboard entries={entries} rates={rates} actualRevenue={actualRevenue} />
    </div>
  )
}
