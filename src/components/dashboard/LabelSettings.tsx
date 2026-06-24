"use client"

import { useEffect, useState } from "react"

interface LabelRow {
  waLabelId: string
  name: string
  color: number
  isStage: boolean
  stageOrder: number | null
  applyRule: string | null
}

// Self-contained chat-tagging config: the master toggle + per-label "mix" setup
// (stage vs additive tag, funnel order, optional rule). Saves to its own API so
// it doesn't entangle with the surrounding settings form — all buttons are
// type="button" since it renders inside the settings <form>.
export function LabelSettings({ agentId }: { agentId: string }) {
  const [enabled, setEnabled] = useState(false)
  const [labels, setLabels] = useState<LabelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/agents/${agentId}/labels`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.labels)) {
          setEnabled(!!d.chatTaggingEnabled)
          setLabels(d.labels)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentId])

  const patchLabel = (waLabelId: string, patch: Partial<LabelRow>) => {
    setLabels((ls) => ls.map((l) => (l.waLabelId === waLabelId ? { ...l, ...patch } : l)))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/agents/${agentId}/labels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatTaggingEnabled: enabled,
          labels: labels.map((l) => ({
            waLabelId: l.waLabelId,
            isStage: l.isStage,
            stageOrder: l.isStage ? l.stageOrder ?? 0 : null,
            applyRule: l.applyRule?.trim() ? l.applyRule.trim() : null,
          })),
        }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-secondary, #6b7280)" }
  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border, #d4d4d8)", borderRadius: 8, padding: "6px 8px", fontSize: 13, width: "100%",
  }

  return (
    <div style={{ borderTop: "1px solid var(--border, #e4e4e7)", paddingTop: 24, marginTop: 8 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Chat tagging (WhatsApp labels)</h2>
      <p style={{ ...labelStyle, margin: "0 0 16px" }}>
        Let the AI categorise chats with your WhatsApp Business labels. Mark labels as a
        <strong> stage</strong> (a funnel — one active at a time, the AI swaps it) or leave them as an additive
        <strong> tag</strong>. Optionally give a label a rule for when to apply it; otherwise the AI infers from its name.
      </p>

      {/* Master toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false) }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Enable AI chat tagging</span>
      </label>

      {loading ? (
        <p style={labelStyle}>Loading labels…</p>
      ) : labels.length === 0 ? (
        <p style={labelStyle}>
          No WhatsApp labels found yet. Connect a <strong>WhatsApp Business</strong> number and create/sync labels on the
          phone — they&apos;ll appear here automatically.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {labels.map((l) => (
            <div
              key={l.waLabelId}
              style={{
                display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.6fr 2fr", gap: 10, alignItems: "center",
                border: "1px solid var(--border, #e4e4e7)", borderRadius: 10, padding: "10px 12px",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>{l.name}</span>
              <select
                style={inputStyle}
                value={l.isStage ? "stage" : "tag"}
                onChange={(e) => patchLabel(l.waLabelId, { isStage: e.target.value === "stage" })}
              >
                <option value="tag">Tag (additive)</option>
                <option value="stage">Stage (funnel)</option>
              </select>
              <input
                type="number"
                style={{ ...inputStyle, opacity: l.isStage ? 1 : 0.4 }}
                placeholder="order"
                disabled={!l.isStage}
                value={l.stageOrder ?? ""}
                onChange={(e) => patchLabel(l.waLabelId, { stageOrder: e.target.value === "" ? null : Number(e.target.value) })}
              />
              <input
                type="text"
                style={inputStyle}
                placeholder="When to apply (optional) — e.g. agreed to buy but not paid"
                value={l.applyRule ?? ""}
                onChange={(e) => patchLabel(l.waLabelId, { applyRule: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          style={{
            background: "var(--accent, #16a34a)", color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving…" : "Save tagging settings"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "var(--accent, #16a34a)", fontWeight: 600 }}>Saved ✓</span>}
      </div>
    </div>
  )
}

export default LabelSettings
