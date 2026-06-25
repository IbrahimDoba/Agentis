"use client"

import { useEffect, useState } from "react"

type Settings = {
  name: string
  appName: string
  logoUrl: string | null
  primaryColor: string | null
  supportEmail: string | null
  domain: string
  domainAliases: string[]
}

export default function ResellerSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [form, setForm] = useState({ appName: "", logoUrl: "", primaryColor: "#7c3aed", supportEmail: "" })
  const [meta, setMeta] = useState<{ domain: string; aliases: string[] }>({ domain: "", aliases: [] })

  useEffect(() => {
    fetch("/api/reseller/settings")
      .then((r) => r.json())
      .then((d) => {
        const r: Settings | undefined = d.reseller
        if (r) {
          setForm({
            appName: r.appName ?? "",
            logoUrl: r.logoUrl ?? "",
            primaryColor: r.primaryColor ?? "#7c3aed",
            supportEmail: r.supportEmail ?? "",
          })
          setMeta({ domain: r.domain, aliases: r.domainAliases ?? [] })
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch("/api/reseller/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) setMsg({ text: "Saved — your branding updates immediately on your site.", ok: true })
      else setMsg({ text: data.error || "Could not save", ok: false })
    } finally {
      setSaving(false)
    }
  }

  const input: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "9px 11px", fontSize: 14, width: "100%" }
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }
  const field: React.CSSProperties = { marginBottom: 16 }

  if (loading) return <p style={{ color: "var(--text-secondary, #71717a)" }}>Loading…</p>

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Settings</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>
          Your brand — what your customers see on your site, emails, and login.
        </p>
      </div>

      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10, color: msg.ok ? "#166534" : "#991b1b", background: msg.ok ? "#dcfce7" : "#fee2e2" }}>
          {msg.text}
        </div>
      )}

      <form onSubmit={save} style={{ border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 20, background: "var(--bg-secondary, #fff)" }}>
        <div style={field}>
          <label style={label}>App name</label>
          <input style={input} value={form.appName} onChange={(e) => setForm((f) => ({ ...f, appName: e.target.value }))} placeholder="Fast Deals" />
        </div>
        <div style={field}>
          <label style={label}>Logo URL <span style={{ fontWeight: 400, color: "var(--text-secondary, #71717a)" }}>(optional — shown on login/signup)</span></label>
          <input style={input} value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} placeholder="https://…/logo.png" />
        </div>
        <div style={{ ...field, display: "flex", gap: 14, alignItems: "center" }}>
          <div>
            <label style={label}>Accent colour</label>
            <input type="color" style={{ ...input, width: 56, height: 40, padding: 4 }} value={form.primaryColor || "#7c3aed"} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>&nbsp;</label>
            <input style={input} value={form.primaryColor} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))} placeholder="#7c3aed" />
          </div>
        </div>
        <div style={field}>
          <label style={label}>Support email <span style={{ fontWeight: 400, color: "var(--text-secondary, #71717a)" }}>(shown to your customers)</span></label>
          <input style={input} value={form.supportEmail} onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))} placeholder="support@yourbrand.com" />
        </div>

        <button type="submit" disabled={saving} style={{ border: "none", background: "var(--accent, #16a34a)", color: "#fff", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div style={{ border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 18, background: "var(--bg-secondary, #fff)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Domain</div>
        <div style={{ fontSize: 14 }}>{meta.domain}{meta.aliases.length > 0 && <span style={{ color: "var(--text-secondary, #71717a)" }}> · {meta.aliases.join(", ")}</span>}</div>
        <p style={{ fontSize: 12, color: "var(--text-secondary, #71717a)", margin: "8px 0 0" }}>
          Managed by Dailzero — contact support to change your domain.
        </p>
      </div>
    </div>
  )
}
