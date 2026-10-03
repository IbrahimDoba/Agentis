"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/context/ToastContext"
import Button from "@/components/ui/Button"
import styles from "./AgentSettingsTab.module.css"

interface LabelRow {
  waLabelId: string
  name: string
  aiDisabled: boolean
  aiEnabled: boolean
}

// "Only reply to chats with selected labels." Off by default; when on, the AI
// stays silent on every chat that doesn't carry one of the ticked labels —
// including brand-new customers, until someone tags them.
//
// Saves on its own rather than through the tab's main Save: it writes to the
// labels endpoint (policy + selection in one transaction), and the label
// checkboxes only mean something next to the switch they govern.
export function LabelReplyPolicy({ agentId }: { agentId: string }) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [labels, setLabels] = useState<LabelRow[]>([])
  const [enabled, setEnabled] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<{ enabled: boolean; selected: Set<string> }>({ enabled: false, selected: new Set() })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/agents/${agentId}/labels`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const rows: LabelRow[] = data.labels ?? []
        const on = data.labelReplyPolicy === "allowlist"
        const sel = new Set(rows.filter((l) => l.aiEnabled).map((l) => l.waLabelId))
        setLabels(rows)
        setEnabled(on)
        setSelected(sel)
        setSaved({ enabled: on, selected: new Set(sel) })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [agentId])

  const sameSelection = selected.size === saved.selected.size && [...selected].every((id) => saved.selected.has(id))
  const dirty = enabled !== saved.enabled || !sameSelection
  // The API refuses this too; catching it here explains why before they click.
  const emptyAllowlist = enabled && selected.size === 0

  const toggleLabel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (emptyAllowlist || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/labels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelReplyPolicy: enabled ? "allowlist" : "all",
          labels: labels.map((l) => ({ waLabelId: l.waLabelId, aiEnabled: selected.has(l.waLabelId) })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        showToast(err?.error ?? "Couldn't save label reply settings.", "error")
        return
      }
      setSaved({ enabled, selected: new Set(selected) })
      showToast(enabled ? "The AI now replies only to chats with the selected labels." : "The AI replies to all chats again.")
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Reply only to labelled chats</h2>
      <p className={styles.sectionDesc}>
        Limit the AI to chats you&apos;ve tagged with specific WhatsApp labels. Off by default.
      </p>

      <div className={styles.row}>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={loading || labels.length === 0}
          className={`${styles.switch} ${enabled ? styles.switchOn : ""}`}
          onClick={() => setEnabled((v) => !v)}
        >
          <span className={styles.switchKnob} />
        </button>
        <div className={styles.rowText}>
          <label className={styles.rowTitle}>Only reply to chats with selected labels</label>
          <p className={styles.rowDesc}>
            When <strong>on</strong>, the AI stays silent on every chat that doesn&apos;t carry one of the labels below —
            <strong> including new customers</strong>, who get no reply until someone tags their chat. Labels marked
            &quot;AI off&quot; on the Labels tab still win.
          </p>

          {loading ? (
            <p className={styles.rowHint}>Loading labels…</p>
          ) : labels.length === 0 ? (
            <p className={styles.rowHint}>
              No WhatsApp labels yet. Create labels on the phone (WhatsApp Business) and they&apos;ll appear here.
            </p>
          ) : enabled ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {labels.map((l) => (
                <label
                  key={l.waLabelId}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
                    borderRadius: 8, fontSize: 13, cursor: "pointer",
                    border: `1px solid ${selected.has(l.waLabelId) ? "rgba(34,197,94,0.5)" : "var(--border)"}`,
                    background: selected.has(l.waLabelId) ? "rgba(34,197,94,0.08)" : "transparent",
                  }}
                >
                  <input type="checkbox" checked={selected.has(l.waLabelId)} onChange={() => toggleLabel(l.waLabelId)} />
                  {l.name}
                  {l.aiDisabled && <span style={{ color: "#ef4444", fontSize: 11 }}>(AI off)</span>}
                </label>
              ))}
            </div>
          ) : null}

          {emptyAllowlist && (
            <p className={styles.rowHint} style={{ color: "#ef4444" }}>
              Select at least one label — with none selected the AI would never reply to anyone.
            </p>
          )}

          {dirty && (
            <div style={{ marginTop: 12 }}>
              {/* type="button": this sits inside the Settings <form>, and a
                  submit button here would also fire the tab's main save. */}
              <Button type="button" size="sm" loading={saving} disabled={emptyAllowlist} onClick={() => void save()}>
                Save label settings
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
