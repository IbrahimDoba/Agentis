"use client"

import { useCallback, useEffect, useState } from "react"

type ResPlan = { id: string; name: string; priceNaira: number; credits: number; durationDays: number; active: boolean }

const emptyForm = { name: "", priceNaira: "", credits: "", durationDays: "30" }

export default function ResellerPlansPage() {
  const [plans, setPlans] = useState<ResPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: "", priceNaira: "", credits: "", durationDays: "" })

  const load = useCallback(async () => {
    const p = await fetch("/api/reseller/plans").then((r) => r.json())
    if (Array.isArray(p.plans)) setPlans(p.plans)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr("")
    setSaving(true)
    try {
      const res = await fetch("/api/reseller/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          priceNaira: Number(form.priceNaira || 0),
          credits: Number(form.credits || 0),
          durationDays: Number(form.durationDays || 30),
        }),
      })
      const data = await res.json()
      if (res.ok) { setForm(emptyForm); await load() }
      else setErr(data.error || "Could not create plan")
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id: string, body: Partial<ResPlan>) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/reseller/plans/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (res.ok) await load()
    } finally { setBusyId(null) }
  }

  const startEdit = (p: ResPlan) => {
    setEditId(p.id)
    setEditForm({ name: p.name, priceNaira: String(p.priceNaira), credits: String(p.credits), durationDays: String(p.durationDays) })
  }

  const saveEdit = async (id: string) => {
    await patch(id, {
      name: editForm.name.trim(),
      priceNaira: Number(editForm.priceNaira || 0),
      credits: Number(editForm.credits || 0),
      durationDays: Number(editForm.durationDays || 0),
    })
    setEditId(null)
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/reseller/plans/${id}`, { method: "DELETE" })
      if (res.ok) await load()
    } finally { setBusyId(null) }
  }

  const input: React.CSSProperties = {
    border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%",
  }
  const cell: React.CSSProperties = { padding: "12px", fontSize: 13, borderBottom: "1px solid var(--border, #f0f0f0)" }
  const btn: React.CSSProperties = {
    border: "1px solid var(--border, #d4d4d8)", background: "var(--bg-secondary, #fff)",
    borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Plans</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>
          Your own plans — any name, price, credit allowance and duration. You set the price you charge; Dailzero only
          tracks the credits each plan grants from your pool.
        </p>
      </div>

      {/* Create */}
      <form onSubmit={create} style={{ border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 18, background: "var(--bg-secondary, #fff)" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>New plan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Name
            <input style={input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Starter" />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Your price (₦)
            <input style={input} type="number" min={0} value={form.priceNaira} onChange={(e) => setForm((f) => ({ ...f, priceNaira: e.target.value }))} placeholder="10000" />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Credits
            <input style={input} type="number" min={1} value={form.credits} onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))} placeholder="20000" />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Duration (days)
            <input style={input} type="number" min={1} value={form.durationDays} onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))} />
          </label>
        </div>
        {err && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button type="submit" disabled={saving} style={{ ...btn, marginTop: 14, background: "var(--accent, #16a34a)", color: "#fff", borderColor: "transparent", padding: "8px 16px", fontSize: 13 }}>
          {saving ? "Saving…" : "Add plan"}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <p style={{ color: "var(--text-secondary, #71717a)" }}>Loading…</p>
      ) : plans.length === 0 ? (
        <p style={{ color: "var(--text-secondary, #71717a)" }}>No plans yet.</p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border, #e4e4e7)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "var(--bg-primary, #fafafa)" }}>
                <th style={{ ...cell, fontWeight: 700 }}>Name</th>
                <th style={{ ...cell, fontWeight: 700 }}>Price</th>
                <th style={{ ...cell, fontWeight: 700 }}>Credits</th>
                <th style={{ ...cell, fontWeight: 700 }}>Duration</th>
                <th style={{ ...cell, fontWeight: 700 }}>Status</th>
                <th style={{ ...cell, fontWeight: 700 }}></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const editing = editId === p.id
                const ei: React.CSSProperties = { ...input, padding: "5px 8px", maxWidth: 110 }
                return (
                  <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                    <td style={{ ...cell, fontWeight: 700 }}>
                      {editing
                        ? <input style={ei} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                        : p.name}
                    </td>
                    <td style={cell}>
                      {editing
                        ? <input style={ei} type="number" min={0} value={editForm.priceNaira} onChange={(e) => setEditForm((f) => ({ ...f, priceNaira: e.target.value }))} />
                        : `₦${p.priceNaira.toLocaleString()}`}
                    </td>
                    <td style={cell}>
                      {editing
                        ? <input style={ei} type="number" min={1} value={editForm.credits} onChange={(e) => setEditForm((f) => ({ ...f, credits: e.target.value }))} />
                        : p.credits.toLocaleString()}
                    </td>
                    <td style={cell}>
                      {editing
                        ? <input style={ei} type="number" min={1} value={editForm.durationDays} onChange={(e) => setEditForm((f) => ({ ...f, durationDays: e.target.value }))} />
                        : `${p.durationDays}d`}
                    </td>
                    <td style={cell}>{p.active ? <span style={{ color: "#16a34a", fontWeight: 700 }}>Active</span> : <span style={{ color: "#71717a" }}>Inactive</span>}</td>
                    <td style={cell}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {editing ? (
                          <>
                            <button type="button" style={{ ...btn, background: "var(--accent, #16a34a)", color: "#fff", borderColor: "transparent" }} disabled={busyId === p.id} onClick={() => saveEdit(p.id)}>
                              {busyId === p.id ? "…" : "Save"}
                            </button>
                            <button type="button" style={btn} disabled={busyId === p.id} onClick={() => setEditId(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" style={btn} disabled={busyId === p.id} onClick={() => startEdit(p)}>Edit</button>
                            <button type="button" style={btn} disabled={busyId === p.id} onClick={() => patch(p.id, { active: !p.active })}>
                              {p.active ? "Deactivate" : "Activate"}
                            </button>
                            <button type="button" style={{ ...btn, color: "#dc2626" }} disabled={busyId === p.id} onClick={() => remove(p.id)}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
