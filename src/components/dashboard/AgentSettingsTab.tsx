"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Button from "@/components/ui/Button"
import { useToast } from "@/context/ToastContext"
import type { AgentPublic } from "@/types"
import styles from "./AgentSettingsTab.module.css"

interface AgentSettingsTabProps {
  agent: AgentPublic
  onDirtyChange?: (dirty: boolean) => void
}

export function AgentSettingsTab({ agent, onDirtyChange }: AgentSettingsTabProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const initialAutoPause = agent.autoPauseOnHumanReply ?? true
  const [autoPauseOnHumanReply, setAutoPauseOnHumanReply] = useState(initialAutoPause)
  const [saving, setSaving] = useState(false)

  const isDirty = autoPauseOnHumanReply !== initialAutoPause

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoPauseOnHumanReply }),
      })
      if (!res.ok) {
        showToast("Failed to save settings.", "error")
        return
      }
      showToast("Settings saved.")
      queryClient.invalidateQueries({ queryKey: ["agent", agent.id] })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Conversation behaviour</h2>
        <p className={styles.sectionDesc}>Control how this agent behaves during live customer conversations.</p>

        <div className={styles.row}>
          <button
            type="button"
            role="switch"
            aria-checked={autoPauseOnHumanReply}
            className={`${styles.switch} ${autoPauseOnHumanReply ? styles.switchOn : ""}`}
            onClick={() => setAutoPauseOnHumanReply((v) => !v)}
          >
            <span className={styles.switchKnob} />
          </button>
          <div className={styles.rowText}>
            <label className={styles.rowTitle}>Auto-pause AI when I reply manually</label>
            <p className={styles.rowDesc}>
              When you (or anyone on your team) sends a message in a conversation — from the dashboard or directly via WhatsApp on your linked phone — the AI for that single conversation pauses. The customer&apos;s next message goes to you, not the AI. You can re-enable AI for that conversation any time by clicking the AI toggle on the chat header.
              {" "}
              <strong>Turn this off</strong> if you prefer to manage handoff yourself with the manual AI / Human toggle.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" loading={saving} disabled={!isDirty}>
          Save Settings
        </Button>
      </div>
    </form>
  )
}

export default AgentSettingsTab
