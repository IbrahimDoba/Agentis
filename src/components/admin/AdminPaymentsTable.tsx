"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./AdminPaymentsTable.module.css"
import { formatNaira, PLAN_LABELS } from "@/lib/plans"
import { formatDate } from "@/lib/utils"

interface PaymentRequestRow {
  id: string
  reference: string
  plan: string
  amountNaira: number
  status: string
  notes: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    businessName: string
    plan: string
  }
}

const STATUS_FILTERS = ["all", "PENDING", "PAID", "CANCELLED"] as const
type StatusFilter = typeof STATUS_FILTERS[number]

const PLAN_COLORS: Record<string, string> = {
  starter:    "#1d4ed8",
  pro:        "#6d28d9",
  enterprise: "#92400e",
}

export function AdminPaymentsTable({ requests }: { requests: PaymentRequestRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [approving, setApproving] = useState<string | null>(null)

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter)

  const handleApprove = async (id: string) => {
    if (!confirm("Approve this payment and upgrade the user's plan?")) return
    setApproving(id)
    try {
      const res = await fetch(`/api/admin/payments/${id}/approve`, { method: "POST" })
      if (!res.ok) throw new Error("Failed")
      router.refresh()
    } catch {
      alert("Failed to approve. Please try again.")
    } finally {
      setApproving(null)
    }
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className={styles.filterBar}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={filter === s ? styles.filterBtnActive : styles.filterBtn}
            onClick={() => setFilter(s)}
          >
            {s === "all" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            <span className={styles.filterCount}>
              {s === "all" ? requests.length : requests.filter((r) => r.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {filter === "PENDING" ? "No pending requests — all clear." : "No requests found."}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>User</th>
                <th className={styles.th}>Current Plan</th>
                <th className={styles.th}>Requesting</th>
                <th className={styles.th}>Amount</th>
                <th className={styles.th}>Reference</th>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={styles.tr}>
                  <td className={styles.td}>
                    <div className={styles.userName}>{r.user.name}</div>
                    <div className={styles.userEmail}>{r.user.email}</div>
                    <div className={styles.userBiz}>{r.user.businessName}</div>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.planBadge} data-plan={r.user.plan}>
                      {PLAN_LABELS[r.user.plan] ?? r.user.plan}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span
                      className={styles.planBadge}
                      style={{
                        color: PLAN_COLORS[r.plan] ?? "var(--text-primary)",
                        background: `${PLAN_COLORS[r.plan] ?? "#000"}18`,
                        borderColor: `${PLAN_COLORS[r.plan] ?? "#000"}30`,
                      }}
                    >
                      {PLAN_LABELS[r.plan] ?? r.plan}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.amount}>{formatNaira(r.amountNaira)}</span>
                  </td>
                  <td className={styles.td}>
                    <code className={styles.reference}>{r.reference.slice(0, 16)}…</code>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.date}>{formatDate(r.createdAt)}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={`${styles.statusBadge} ${styles[`status${r.status}`]}`}>
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className={styles.td}>
                    {r.status === "PENDING" && (
                      <button
                        className={styles.approveBtn}
                        onClick={() => handleApprove(r.id)}
                        disabled={approving === r.id}
                      >
                        {approving === r.id ? "Approving…" : "Approve"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
