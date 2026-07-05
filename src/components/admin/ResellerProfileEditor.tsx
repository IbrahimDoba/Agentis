"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export type EditableReseller = {
  id: string
  name: string
  appName: string
  domain: string
  domainAliases: string[]
  primaryColor: string | null
  supportEmail: string | null
  supportWhatsapp: string | null
  logoUrl: string | null
  status: string
}

// Super-admin edit form for a reseller's profile — the details used when the
// reseller was created (minus the admin account + credit pool, which have their
// own controls). Lives on the reseller detail page; collapsed until "Edit".
export default function ResellerProfileEditor({
  reseller,
  isPlatform,
}: {
  reseller: EditableReseller
  isPlatform: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [form, setForm] = useState({
    name: reseller.name,
    appName: reseller.appName,
    domain: reseller.domain,
    domainAliases: reseller.domainAliases.join(", "),
    supportEmail: reseller.supportEmail ?? "",
    primaryColor: reseller.primaryColor ?? "#7c3aed",
    logoUrl: reseller.logoUrl ?? "",
    supportWhatsapp: reseller.supportWhatsapp ?? "",
    status: reseller.status || "active",
  })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/resellers/${reseller.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          domainAliases: form.domainAliases.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        // Reflect the server-normalized values (lowercased domain, de-duped
        // aliases, `#`-prefixed colour) so a reopened form shows the canonical data.
        const r = data.reseller as EditableReseller | undefined
        if (r) {
          setForm((f) => ({
            ...f,
            name: r.name,
            appName: r.appName,
            domain: r.domain,
            domainAliases: r.domainAliases.join(", "),
            supportEmail: r.supportEmail ?? "",
            primaryColor: r.primaryColor ?? "#7c3aed",
            logoUrl: r.logoUrl ?? "",
            supportWhatsapp: r.supportWhatsapp ?? "",
            status: r.status || "active",
          }))
        }
        setMsg({ text: "Profile saved.", ok: true })
        setOpen(false)
        router.refresh()
      } else {
        setMsg({ text: data.error || "Could not save changes", ok: false })
      }
    } catch {
      setMsg({ text: "Could not save changes", ok: false })
    } finally {
      setSaving(false)
    }
  }

  const card: React.CSSProperties = { border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 18, background: "var(--bg-secondary, #fff)" }
  const input: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%" }
  const btn: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", background: "var(--bg-secondary, #fff)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
  const primaryBtn: React.CSSProperties = { ...btn, background: "var(--accent, #16a34a)", color: "#fff", borderColor: "transparent" }
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Profile</span>
        <button type="button" style={btn} onClick={() => { setOpen((o) => !o); setMsg(null) }}>
          {open ? "Cancel" : "Edit profile"}
        </button>
      </div>

      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10, color: msg.ok ? "#166534" : "#991b1b", background: msg.ok ? "#dcfce7" : "#fee2e2" }}>{msg.text}</div>
      )}

      {open && (
        <form onSubmit={save} style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <label style={label}>Internal name<input style={input} value={form.name} onChange={set("name")} placeholder="Acme Reseller" /></label>
            <label style={label}>App name (brand)<input style={input} value={form.appName} onChange={set("appName")} placeholder="Acme WA" /></label>
            <label style={label}>
              Domain
              <input style={{ ...input, ...(isPlatform ? { background: "var(--bg-primary, #f4f4f5)", cursor: "not-allowed" } : {}) }} value={form.domain} onChange={set("domain")} placeholder="acme.com" disabled={isPlatform} />
            </label>
            <label style={label}>Domain aliases (comma-sep)<input style={input} value={form.domainAliases} onChange={set("domainAliases")} placeholder="www.acme.com" /></label>
            <label style={label}>Support email<input style={input} value={form.supportEmail} onChange={set("supportEmail")} placeholder="support@acme.com" /></label>
            <label style={label}>Support WhatsApp<input style={input} value={form.supportWhatsapp} onChange={set("supportWhatsapp")} placeholder="+234…" /></label>
            <label style={label}>Logo URL<input style={input} value={form.logoUrl} onChange={set("logoUrl")} placeholder="https://…/logo.png" /></label>
            <label style={label}>Accent colour<input style={{ ...input, padding: 4, height: 38 }} type="color" value={form.primaryColor || "#7c3aed"} onChange={set("primaryColor")} /></label>
            <label style={label}>
              Status
              <select style={{ ...input, ...(isPlatform ? { background: "var(--bg-primary, #f4f4f5)", cursor: "not-allowed" } : {}) }} value={form.status} onChange={set("status")} disabled={isPlatform}>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </label>
          </div>

          <p style={{ fontSize: 12, color: "var(--text-secondary, #71717a)", margin: "12px 0 0" }}>
            Changing the domain re-points this tenant inside the app and updates branded email links — but the new domain&apos;s DNS/SSL must be pointed at the app (e.g. added in Vercel) separately, or the reseller&apos;s users won&apos;t be able to reach it. Suspending a reseller stops her domain from resolving to her tenant.
          </p>

          <button type="submit" disabled={saving} style={{ ...primaryBtn, marginTop: 14 }}>{saving ? "Saving…" : "Save changes"}</button>
        </form>
      )}
    </div>
  )
}
