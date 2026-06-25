"use client"

import { useEffect, useState } from "react"

// Lets an admin (Dailzero ADMIN or a RESELLER_ADMIN) set the support WhatsApp
// number their users see as a "Contact support" button. Writes to the current
// tenant's Reseller row via /api/reseller/settings (ADMIN -> platform row,
// RESELLER_ADMIN -> her own). Render this only for admins.
export function AdminSupportNumber() {
  const [num, setNum] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/reseller/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.reseller) setNum(d.reseller.supportWhatsapp ?? "") })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch("/api/reseller/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supportWhatsapp: num }),
      })
      if (res.ok) setSaved(true)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ borderTop: "1px solid var(--border, #e4e4e7)", paddingTop: 24, marginTop: 8 }}>
      <div style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Support WhatsApp</div>
      <p style={{ fontSize: 13, color: "var(--text-secondary, #6b7280)", margin: "0 0 14px" }}>
        Your users see a <strong>Contact support</strong> button that opens a WhatsApp chat to this number.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={num}
          onChange={(e) => { setNum(e.target.value); setSaved(false) }}
          placeholder="+234 800 000 0000"
          disabled={loading}
          style={{ border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "9px 11px", fontSize: 14, width: 260, maxWidth: "100%" }}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          style={{ border: "none", background: "var(--accent, #16a34a)", color: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "var(--accent, #16a34a)", fontWeight: 600 }}>Saved ✓</span>}
      </div>
    </div>
  )
}
