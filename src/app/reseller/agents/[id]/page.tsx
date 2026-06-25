"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

type AgentOwner = { id: string; name: string; email: string; businessName: string }
type AgentData = {
  id: string
  businessName: string
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  contactEmail: string | null
  contactPhone: string | null
  websiteLinks: string | null
  responseGuidelines: string | null
  messagingEnabled: boolean
  aiRepliesEnabled: boolean
  status: string
  user: AgentOwner
}

const emptyForm = {
  businessName: "", businessDescription: "", productsServices: "", faqs: "",
  operatingHours: "", contactEmail: "", contactPhone: "", websiteLinks: "",
  responseGuidelines: "", messagingEnabled: true, aiRepliesEnabled: true,
}

export default function ResellerAgentEditPage() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [owner, setOwner] = useState<AgentOwner | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    const d = await fetch(`/api/reseller/agents/${id}`).then((r) => r.json())
    const a: AgentData | undefined = d.agent
    if (a) {
      setOwner(a.user)
      setForm({
        businessName: a.businessName ?? "", businessDescription: a.businessDescription ?? "",
        productsServices: a.productsServices ?? "", faqs: a.faqs ?? "",
        operatingHours: a.operatingHours ?? "", contactEmail: a.contactEmail ?? "",
        contactPhone: a.contactPhone ?? "", websiteLinks: a.websiteLinks ?? "",
        responseGuidelines: a.responseGuidelines ?? "",
        messagingEnabled: a.messagingEnabled, aiRepliesEnabled: a.aiRepliesEnabled,
      })
    }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setMsg(null)
    try {
      const res = await fetch(`/api/reseller/agents/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) setMsg({ text: "Saved — the agent will use the updated info on its next reply.", ok: true })
      else setMsg({ text: data.error || "Could not save", ok: false })
    } finally { setSaving(false) }
  }

  const input: React.CSSProperties = { border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "9px 11px", fontSize: 14, width: "100%" }
  const ta: React.CSSProperties = { ...input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }
  const field: React.CSSProperties = { marginBottom: 16 }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (loading) return <p style={{ color: "var(--text-secondary, #71717a)" }}>Loading…</p>
  if (!owner) return <p style={{ color: "var(--text-secondary, #71717a)" }}>Agent not found.</p>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
      <Link href={`/reseller/users/${owner.id}`} style={{ fontSize: 13, color: "var(--text-secondary, #71717a)", textDecoration: "none" }}>← {owner.businessName || owner.name}</Link>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Edit agent</h1>
        <p style={{ color: "var(--text-secondary, #71717a)", margin: "4px 0 0", fontSize: 14 }}>The business knowledge this customer&apos;s AI uses to answer.</p>
      </div>

      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 10, color: msg.ok ? "#166534" : "#991b1b", background: msg.ok ? "#dcfce7" : "#fee2e2" }}>{msg.text}</div>
      )}

      <form onSubmit={save} style={{ border: "1px solid var(--border, #e4e4e7)", borderRadius: 14, padding: 20, background: "var(--bg-secondary, #fff)" }}>
        <div style={field}><label style={label}>Business name</label><input style={input} value={form.businessName} onChange={set("businessName")} /></div>
        <div style={field}><label style={label}>Business description</label><textarea style={ta} value={form.businessDescription} onChange={set("businessDescription")} /></div>
        <div style={field}><label style={label}>Products &amp; services</label><textarea style={ta} value={form.productsServices} onChange={set("productsServices")} /></div>
        <div style={field}><label style={label}>FAQs</label><textarea style={ta} value={form.faqs} onChange={set("faqs")} /></div>
        <div style={field}><label style={label}>Response guidelines</label><textarea style={ta} value={form.responseGuidelines} onChange={set("responseGuidelines")} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div style={field}><label style={label}>Operating hours</label><input style={input} value={form.operatingHours} onChange={set("operatingHours")} /></div>
          <div style={field}><label style={label}>Contact email</label><input style={input} value={form.contactEmail} onChange={set("contactEmail")} /></div>
          <div style={field}><label style={label}>Contact phone</label><input style={input} value={form.contactPhone} onChange={set("contactPhone")} /></div>
          <div style={field}><label style={label}>Website / links</label><input style={input} value={form.websiteLinks} onChange={set("websiteLinks")} /></div>
        </div>

        <div style={{ display: "flex", gap: 18, margin: "4px 0 18px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={form.messagingEnabled} onChange={(e) => setForm((f) => ({ ...f, messagingEnabled: e.target.checked }))} /> Messaging enabled
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={form.aiRepliesEnabled} onChange={(e) => setForm((f) => ({ ...f, aiRepliesEnabled: e.target.checked }))} /> AI replies enabled
          </label>
        </div>

        <button type="submit" disabled={saving} style={{ border: "none", background: "var(--accent, #16a34a)", color: "#fff", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : "Save agent"}
        </button>
      </form>
    </div>
  )
}
