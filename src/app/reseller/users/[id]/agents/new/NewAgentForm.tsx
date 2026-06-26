"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

const empty = {
  businessName: "", businessDescription: "", productsServices: "", faqs: "",
  responseGuidelines: "", operatingHours: "", contactEmail: "", contactPhone: "", websiteLinks: "",
}

export default function NewAgentForm({
  userId,
  customerLabel,
  defaultBusinessName,
}: {
  userId: string
  customerLabel: string
  defaultBusinessName: string
}) {
  const router = useRouter()
  const [form, setForm] = useState({ ...empty, businessName: defaultBusinessName })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.businessName.trim().length < 2) {
      setErr("Business name must be at least 2 characters")
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch("/api/reseller/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...form }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        router.push(`/reseller/users/${userId}`)
        router.refresh()
      } else {
        setErr(data.error || "Could not create the agent")
        setSaving(false)
      }
    } catch {
      setErr("Could not create the agent")
      setSaving(false)
    }
  }

  const input: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "9px 11px", fontSize: 14, width: "100%" }
  const ta: React.CSSProperties = { ...input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }
  const field: React.CSSProperties = { marginBottom: 16 }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
      <Link href={`/reseller/users/${userId}`} style={{ fontSize: 13, color: "var(--text-secondary, #71717a)", textDecoration: "none" }}>← {customerLabel}</Link>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Add an agent</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>
          Create a WhatsApp AI agent for this customer. They&apos;ll connect their WhatsApp number from their own dashboard once it&apos;s set up.
        </p>
      </div>

      {err && (
        <div style={{ fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10, color: "#991b1b", background: "#fee2e2" }}>{err}</div>
      )}

      <form onSubmit={submit} style={{ border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 20, background: "var(--bg-secondary, #fff)" }}>
        <div style={field}><label style={label}>Business name *</label><input style={input} value={form.businessName} onChange={set("businessName")} placeholder="e.g. Bella's Boutique" /></div>
        <div style={field}><label style={label}>Business description</label><textarea style={ta} value={form.businessDescription} onChange={set("businessDescription")} placeholder="What the business does, who it serves." /></div>
        <div style={field}><label style={label}>Products &amp; services</label><textarea style={ta} value={form.productsServices} onChange={set("productsServices")} placeholder="What they sell or offer, with prices if relevant." /></div>
        <div style={field}><label style={label}>FAQs</label><textarea style={ta} value={form.faqs} onChange={set("faqs")} placeholder="Common questions and the answers the agent should give." /></div>
        <div style={field}><label style={label}>Response guidelines</label><textarea style={ta} value={form.responseGuidelines} onChange={set("responseGuidelines")} placeholder="Tone, rules, anything the agent must always or never do." /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div style={field}><label style={label}>Operating hours</label><input style={input} value={form.operatingHours} onChange={set("operatingHours")} /></div>
          <div style={field}><label style={label}>Contact email</label><input style={input} value={form.contactEmail} onChange={set("contactEmail")} /></div>
          <div style={field}><label style={label}>Contact phone</label><input style={input} value={form.contactPhone} onChange={set("contactPhone")} /></div>
          <div style={field}><label style={label}>Website / links</label><input style={input} value={form.websiteLinks} onChange={set("websiteLinks")} /></div>
        </div>

        <button type="submit" disabled={saving} style={{ border: "none", background: "var(--accent, #16a34a)", color: "#fff", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Creating…" : "Create agent"}
        </button>
      </form>
    </div>
  )
}
