"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

type ResUser = {
  id: string
  name: string
  email: string
  businessName: string
  role: string
  status: string
  plan: string
  creditBalance: number
  creditsExpireAt: string | null
  subscriptionExpiresAt: string | null
  createdAt: string
}
type ResPlan = { id: string; name: string; priceNaira: number; credits: number; durationDays: number; active: boolean }

const STATUS_COLOR: Record<string, string> = {
  APPROVED: "#16a34a", PENDING: "#d97706", SUSPENDED: "#dc2626", REJECTED: "#71717a",
}

function fmtDate(s: string | null): string {
  if (!s) return "—"
  const d = new Date(s)
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

export default function ResellerUsersPage() {
  const [users, setUsers] = useState<ResUser[]>([])
  const [plans, setPlans] = useState<ResPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const del = async (userId: string) => {
    setBusyId(userId)
    setMsg(null)
    try {
      const res = await fetch(`/api/reseller/users/${userId}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok) { setMsg({ text: "Customer deleted.", ok: true }); await load() }
      else setMsg({ text: data.error || "Delete failed", ok: false })
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  const load = useCallback(async () => {
    const [u, p] = await Promise.all([
      fetch("/api/reseller/users").then((r) => r.json()),
      fetch("/api/reseller/plans").then((r) => r.json()),
    ])
    if (Array.isArray(u.users)) setUsers(u.users)
    if (Array.isArray(p.plans)) setPlans(p.plans.filter((pl: ResPlan) => pl.active))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const activate = async (userId: string) => {
    const planId = picked[userId]
    if (!planId) { setMsg({ text: "Pick a plan first", ok: false }); return }
    setBusyId(userId)
    setMsg(null)
    try {
      const res = await fetch(`/api/reseller/users/${userId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg({ text: `Activated "${data.planName}" — ${data.credits.toLocaleString()} credits granted. Pool left: ${data.poolRemaining.toLocaleString()}.`, ok: true })
        await load()
      } else {
        setMsg({ text: data.error || "Activation failed", ok: false })
      }
    } finally {
      setBusyId(null)
    }
  }

  const setStatus = async (userId: string, status: string) => {
    setBusyId(userId)
    setMsg(null)
    try {
      const res = await fetch(`/api/reseller/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (res.ok) await load()
      else setMsg({ text: data.error || "Update failed", ok: false })
    } finally {
      setBusyId(null)
    }
  }

  const btn: React.CSSProperties = {
    border: "1px solid var(--border, #d4d4d8)", background: "var(--bg-secondary, #fff)",
    borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
  }
  const cell: React.CSSProperties = { padding: "12px 12px", fontSize: 13, borderBottom: "1px solid var(--border, #f0f0f0)", verticalAlign: "top" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Customers</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>
          Approve sign-ups and activate a plan once you&apos;ve collected payment. Activating draws credits from your pool.
        </p>
      </div>

      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10,
          color: msg.ok ? "#166534" : "#991b1b", background: msg.ok ? "#dcfce7" : "#fee2e2" }}>
          {msg.text}
        </div>
      )}

      {plans.length === 0 && !loading && (
        <div style={{ fontSize: 13, padding: "10px 14px", borderRadius: 10, background: "#fef9c3", color: "#854d0e" }}>
          You have no active plans yet. Create one under <strong>Plans</strong> before you can activate customers.
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary, #71717a)" }}>Loading…</p>
      ) : users.length === 0 ? (
        <p style={{ color: "var(--text-secondary, #71717a)" }}>No customers yet. They appear here when they sign up on your site.</p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border, #e4e4e7)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "var(--bg-primary, #fafafa)" }}>
                <th style={{ ...cell, fontWeight: 700 }}>Customer</th>
                <th style={{ ...cell, fontWeight: 700 }}>Status</th>
                <th style={{ ...cell, fontWeight: 700 }}>Credits / expiry</th>
                <th style={{ ...cell, fontWeight: 700 }}>Activate a plan</th>
                <th style={{ ...cell, fontWeight: 700 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={cell}>
                    <Link href={`/reseller/users/${u.id}`} style={{ fontWeight: 700, color: "var(--accent, #16a34a)", textDecoration: "none" }}>{u.businessName || u.name}</Link>
                    <div style={{ color: "var(--text-secondary, #71717a)" }}>{u.email}</div>
                    {u.role === "RESELLER_ADMIN" && <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 700, marginTop: 2 }}>YOU (admin)</div>}
                  </td>
                  <td style={cell}>
                    <span style={{ fontWeight: 700, color: STATUS_COLOR[u.status] ?? "#71717a" }}>{u.status}</span>
                  </td>
                  <td style={cell}>
                    <div style={{ fontWeight: 700 }}>{u.creditBalance.toLocaleString()} cr</div>
                    <div style={{ color: "var(--text-secondary, #71717a)" }}>exp {fmtDate(u.creditsExpireAt)}</div>
                  </td>
                  <td style={cell}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        value={picked[u.id] ?? ""}
                        onChange={(e) => setPicked((p) => ({ ...p, [u.id]: e.target.value }))}
                        style={{ ...btn, cursor: "default", maxWidth: 180 }}
                        disabled={plans.length === 0}
                      >
                        <option value="">Select plan…</option>
                        {plans.map((pl) => (
                          <option key={pl.id} value={pl.id}>{pl.name} · {pl.credits.toLocaleString()}cr · {pl.durationDays}d</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => activate(u.id)}
                        disabled={busyId === u.id || plans.length === 0}
                        style={{ ...btn, background: "var(--accent, #16a34a)", color: "#fff", borderColor: "transparent", opacity: busyId === u.id ? 0.6 : 1 }}
                      >
                        {busyId === u.id ? "…" : "Activate"}
                      </button>
                    </div>
                  </td>
                  <td style={cell}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {u.status !== "APPROVED" && (
                        <button type="button" style={btn} disabled={busyId === u.id} onClick={() => setStatus(u.id, "APPROVED")}>Approve</button>
                      )}
                      {u.status !== "SUSPENDED" && u.role !== "RESELLER_ADMIN" && (
                        <button type="button" style={{ ...btn, color: "#dc2626" }} disabled={busyId === u.id} onClick={() => setStatus(u.id, "SUSPENDED")}>Suspend</button>
                      )}
                      {u.role !== "RESELLER_ADMIN" && (
                        confirmId === u.id ? (
                          <>
                            <button type="button" style={{ ...btn, background: "#dc2626", color: "#fff", borderColor: "transparent" }} disabled={busyId === u.id} onClick={() => del(u.id)}>{busyId === u.id ? "…" : "Confirm delete"}</button>
                            <button type="button" style={btn} onClick={() => setConfirmId(null)}>Cancel</button>
                          </>
                        ) : (
                          <button type="button" style={{ ...btn, color: "#991b1b" }} disabled={busyId === u.id} onClick={() => setConfirmId(u.id)}>Delete</button>
                        )
                      )}
                    </div>
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
