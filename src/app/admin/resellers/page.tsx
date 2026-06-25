"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

type Reseller = {
  id: string
  name: string
  appName: string
  domain: string
  domainAliases: string[]
  primaryColor: string | null
  supportEmail: string | null
  status: string
  creditPool: number
  creditPoolTotal: number
  _count: { users: number; plans: number }
}

const emptyCreate = {
  name: "", appName: "", domain: "", supportEmail: "", primaryColor: "#7c3aed",
  poolCredits: "200000", adminName: "", adminEmail: "", adminPassword: "",
}

export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [loading, setLoading] = useState(true)
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyCreate)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/resellers").then((r) => r.json())
    if (Array.isArray(d.resellers)) setResellers(d.resellers)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const allocate = async (id: string) => {
    const credits = Number(alloc[id])
    if (!credits) { setMsg({ text: "Enter an amount", ok: false }); return }
    setBusyId(id); setMsg(null)
    try {
      const res = await fetch(`/api/admin/resellers/${id}/allocate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credits }),
      })
      const data = await res.json()
      if (res.ok) { setMsg({ text: `Pool updated → ${data.creditPool.toLocaleString()} credits`, ok: true }); setAlloc((a) => ({ ...a, [id]: "" })); await load() }
      else setMsg({ text: data.error || "Failed", ok: false })
    } finally { setBusyId(null) }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setMsg(null)
    try {
      const res = await fetch("/api/admin/resellers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, poolCredits: Number(form.poolCredits || 0) }),
      })
      const data = await res.json()
      if (res.ok) { setMsg({ text: `Created "${data.reseller.appName}" — admin ${data.adminEmail}`, ok: true }); setForm(emptyCreate); setShowCreate(false); await load() }
      else setMsg({ text: data.error || "Could not create reseller", ok: false })
    } finally { setCreating(false) }
  }

  const card: React.CSSProperties = { border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 18, background: "var(--bg-secondary, #fff)" }
  const input: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%" }
  const btn: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", background: "var(--bg-secondary, #fff)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
  const primaryBtn: React.CSSProperties = { ...btn, background: "var(--accent, #16a34a)", color: "#fff", borderColor: "transparent" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Resellers</h1>
          <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>White-label tenants — top up their credit pools and drill into their customers.</p>
        </div>
        <button type="button" style={primaryBtn} onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Cancel" : "+ New reseller"}</button>
      </div>

      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10, color: msg.ok ? "#166534" : "#991b1b", background: msg.ok ? "#dcfce7" : "#fee2e2" }}>{msg.text}</div>
      )}

      {showCreate && (
        <form onSubmit={create} style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Provision a reseller</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Internal name<input style={input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Acme Reseller" /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>App name (brand)<input style={input} value={form.appName} onChange={(e) => setForm((f) => ({ ...f, appName: e.target.value }))} placeholder="Acme WA" /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Domain<input style={input} value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="acme.com" /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Support email<input style={input} value={form.supportEmail} onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))} placeholder="support@acme.com" /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Accent colour<input style={input} type="color" value={form.primaryColor} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))} /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Initial pool credits<input style={input} type="number" min={0} value={form.poolCredits} onChange={(e) => setForm((f) => ({ ...f, poolCredits: e.target.value }))} /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Admin name<input style={input} value={form.adminName} onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))} /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Admin email<input style={input} value={form.adminEmail} onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))} /></label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Admin password<input style={input} type="text" value={form.adminPassword} onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))} placeholder="8+ chars" /></label>
          </div>
          <button type="submit" disabled={creating} style={{ ...primaryBtn, marginTop: 14 }}>{creating ? "Creating…" : "Create reseller + admin"}</button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "var(--text-secondary, #71717a)" }}>Loading…</p>
      ) : resellers.length === 0 ? (
        <p style={{ color: "var(--text-secondary, #71717a)" }}>No resellers yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {resellers.map((r) => {
            const pct = r.creditPoolTotal > 0 ? Math.round((r.creditPool / r.creditPoolTotal) * 100) : 0
            return (
              <div key={r.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{r.appName} <span style={{ fontWeight: 600, color: "var(--text-secondary, #71717a)", fontSize: 13 }}>· {r.domain}</span></div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary, #71717a)", marginTop: 2 }}>
                      {r._count.users} customers · {r._count.plans} plans · {r.status}
                    </div>
                  </div>
                  <Link href={`/admin/resellers/${r.id}`} style={{ ...btn, textDecoration: "none", color: "var(--text-primary, #18181b)" }}>View customers →</Link>
                </div>

                <div style={{ marginTop: 14, fontSize: 13 }}>
                  <strong>{r.creditPool.toLocaleString()}</strong> credits left
                  <span style={{ color: "var(--text-secondary, #71717a)" }}> of {r.creditPoolTotal.toLocaleString()} allocated ({pct}%)</span>
                </div>
                <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: "var(--border, #e4e4e7)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct < 15 ? "#dc2626" : "var(--accent, #16a34a)" }} />
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                  <input
                    style={{ ...input, width: 160 }} type="number" placeholder="credits (+ / −)"
                    value={alloc[r.id] ?? ""} onChange={(e) => setAlloc((a) => ({ ...a, [r.id]: e.target.value }))}
                  />
                  <button type="button" style={primaryBtn} disabled={busyId === r.id} onClick={() => allocate(r.id)}>
                    {busyId === r.id ? "…" : "Allocate to pool"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
