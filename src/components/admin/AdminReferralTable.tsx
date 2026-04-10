"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./AdminReferralTable.module.css"
import { formatDate } from "@/lib/utils"
import { formatNaira, PLAN_LABELS, calcCommission } from "@/lib/plans"

const STATUS_COLORS: Record<string, string> = {
  PENDING: "var(--warning)",
  COMPLETED: "var(--accent)",
  REWARDED: "var(--teal)",
}
const STATUS_LABELS: Record<string, string> = { PENDING: "Pending", COMPLETED: "Completed", REWARDED: "Paid Out" }

interface ReferralRow {
  id: string
  referrer: { id: string; name: string; email: string }
  referred: { id: string; name: string; email: string; plan: string; status: string }
  code: string | null
  status: string
  commissionEarned: number | null
  rewardGranted: boolean
  assignedByAdmin: boolean
  createdAt: string
}

interface User { id: string; name: string; email: string }

interface Props {
  referrals: ReferralRow[]
  users: User[]
}

export function AdminReferralTable({ referrals: initial, users }: Props) {
  const router = useRouter()
  const [referrals, setReferrals] = useState(initial)
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "COMPLETED" | "REWARDED">("ALL")
  const [loading, setLoading] = useState<string | null>(null)

  // Assign modal state
  const [showAssign, setShowAssign] = useState(false)
  const [assignReferrer, setAssignReferrer] = useState("")
  const [assignReferred, setAssignReferred] = useState("")
  const [assignCommission, setAssignCommission] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState("")

  // Edit commission modal
  const [editId, setEditId] = useState<string | null>(null)
  const [editCommission, setEditCommission] = useState("")
  const [saving, setSaving] = useState(false)

  const filtered = referrals.filter((r) => filter === "ALL" || r.status === filter)

  async function markRewarded(id: string) {
    setLoading(id)
    try {
      const res = await fetch(`/api/admin/referrals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardGranted: true }),
      })
      if (!res.ok) throw new Error()
      setReferrals((prev) => prev.map((r) => r.id === id ? { ...r, rewardGranted: true, status: "REWARDED" } : r))
    } catch { alert("Failed to update") }
    finally { setLoading(null) }
  }

  async function handleAssign() {
    if (!assignReferrer || !assignReferred) { setAssignError("Select both users."); return }
    if (assignReferrer === assignReferred) { setAssignError("Cannot refer yourself."); return }
    setAssigning(true); setAssignError("")
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerId: assignReferrer,
          referredId: assignReferred,
          commissionEarned: assignCommission ? Number(assignCommission) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setAssignError(data.error || "Failed"); return }
      router.refresh()
      setShowAssign(false)
      setAssignReferrer(""); setAssignReferred(""); setAssignCommission("")
    } catch { setAssignError("Failed to assign") }
    finally { setAssigning(false) }
  }

  async function saveCommission() {
    if (!editId) return
    setSaving(true)
    try {
      await fetch(`/api/admin/referrals/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionEarned: Number(editCommission), status: "COMPLETED" }),
      })
      setReferrals((prev) => prev.map((r) => r.id === editId ? { ...r, commissionEarned: Number(editCommission), status: "COMPLETED" } : r))
      setEditId(null)
    } catch { alert("Failed") }
    finally { setSaving(false) }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(["ALL", "PENDING", "COMPLETED", "REWARDED"] as const).map((f) => (
            <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ""}`} onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
        <button className={styles.assignBtn} onClick={() => setShowAssign(true)}>
          + Assign Referrer
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Referrer</th>
              <th className={styles.th}>Referred User</th>
              <th className={styles.th}>Plan</th>
              <th className={styles.th}>Commission</th>
              <th className={styles.th}>Via</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Date</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.userName}>{r.referrer.name}</div>
                  <div className={styles.userEmail}>{r.referrer.email}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.userName}>{r.referred.name}</div>
                  <div className={styles.userEmail}>{r.referred.email}</div>
                </td>
                <td className={styles.td}>
                  <span className={styles.plan}>{PLAN_LABELS[r.referred.plan] ?? r.referred.plan}</span>
                </td>
                <td className={styles.td}>
                  {r.commissionEarned != null ? (
                    <span className={styles.commission}>{formatNaira(r.commissionEarned)}</span>
                  ) : (
                    <button className={styles.setCommBtn} onClick={() => { setEditId(r.id); setEditCommission("") }}>
                      Set amount
                    </button>
                  )}
                </td>
                <td className={styles.td}>
                  <span className={styles.via}>{r.assignedByAdmin ? "Manual" : "Link"}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.statusPill} style={{ color: STATUS_COLORS[r.status], background: `${STATUS_COLORS[r.status]}18` }}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className={styles.td}>
                  <span className={styles.date}>{formatDate(r.createdAt)}</span>
                </td>
                <td className={styles.td}>
                  {!r.rewardGranted && r.status === "COMPLETED" && (
                    <button
                      className={styles.rewardBtn}
                      onClick={() => markRewarded(r.id)}
                      disabled={loading === r.id}
                    >
                      {loading === r.id ? "…" : "Mark Paid"}
                    </button>
                  )}
                  {r.rewardGranted && <span className={styles.paidBadge}>✓ Paid</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>No referrals found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Assign referrer modal */}
      {showAssign && (
        <div className={styles.backdrop} onClick={() => setShowAssign(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Assign Referrer Manually</span>
              <button className={styles.modalClose} onClick={() => setShowAssign(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label className={styles.label}>Referrer (who referred)</label>
                <select className={styles.select} value={assignReferrer} onChange={(e) => setAssignReferrer(e.target.value)}>
                  <option value="">Select user…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Referred (who was referred)</label>
                <select className={styles.select} value={assignReferred} onChange={(e) => setAssignReferred(e.target.value)}>
                  <option value="">Select user…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Commission amount (₦) — optional</label>
                <input className={styles.input} type="number" placeholder="e.g. 7500" value={assignCommission} onChange={(e) => setAssignCommission(e.target.value)} />
                <p className={styles.fieldHint}>Leave blank to auto-calculate when plan is set. Starter = ₦7,500 · Pro = ₦12,750</p>
              </div>
              {assignError && <p className={styles.error}>{assignError}</p>}
              <button className={styles.confirmBtn} onClick={handleAssign} disabled={assigning}>
                {assigning ? "Assigning…" : "Assign Referral"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit commission modal */}
      {editId && (
        <div className={styles.backdrop} onClick={() => setEditId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Set Commission Amount</span>
              <button className={styles.modalClose} onClick={() => setEditId(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label className={styles.label}>Commission (₦)</label>
                <input className={styles.input} type="number" placeholder="e.g. 12750" value={editCommission} onChange={(e) => setEditCommission(e.target.value)} />
                <p className={styles.fieldHint}>Starter = ₦7,500 · Pro = ₦12,750 · Enterprise = custom</p>
              </div>
              <button className={styles.confirmBtn} onClick={saveCommission} disabled={saving || !editCommission}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
