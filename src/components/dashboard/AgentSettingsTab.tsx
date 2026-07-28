"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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
  const initialPauseOnHandoff = agent.pauseOnAiHandoff ?? true
  const initialPauseOnLead = agent.pauseOnQualifiedLead ?? true
  const initialAutoResume = agent.autoResumeAiAfterMinutes ?? 0 // 0 = off in the UI
  const initialReplyDelay = agent.replyDelaySeconds ?? 0 // 0 = instant, no batching
  const initialAiReplies = agent.aiRepliesEnabled ?? true
  const initialReplyGuard = agent.replyGuardEnabled ?? false // off by default
  const [aiRepliesEnabled, setAiRepliesEnabled] = useState(initialAiReplies)
  const [replyGuardEnabled, setReplyGuardEnabled] = useState(initialReplyGuard)
  const [autoPauseOnHumanReply, setAutoPauseOnHumanReply] = useState(initialAutoPause)
  const [pauseOnAiHandoff, setPauseOnAiHandoff] = useState(initialPauseOnHandoff)
  const [pauseOnQualifiedLead, setPauseOnQualifiedLead] = useState(initialPauseOnLead)
  const [autoResumeAiAfterMinutes, setAutoResumeAiAfterMinutes] = useState(initialAutoResume)
  const [replyDelaySeconds, setReplyDelaySeconds] = useState(initialReplyDelay)
  const [saving, setSaving] = useState(false)

  const isDirty =
    aiRepliesEnabled !== initialAiReplies ||
    replyGuardEnabled !== initialReplyGuard ||
    autoPauseOnHumanReply !== initialAutoPause ||
    pauseOnAiHandoff !== initialPauseOnHandoff ||
    pauseOnQualifiedLead !== initialPauseOnLead ||
    autoResumeAiAfterMinutes !== initialAutoResume ||
    replyDelaySeconds !== initialReplyDelay

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
        body: JSON.stringify({
          aiRepliesEnabled,
          replyGuardEnabled,
          autoPauseOnHumanReply,
          pauseOnAiHandoff,
          pauseOnQualifiedLead,
          autoResumeAiAfterMinutes: autoResumeAiAfterMinutes || null,
          replyDelaySeconds,
        }),
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
            aria-checked={aiRepliesEnabled}
            className={`${styles.switch} ${aiRepliesEnabled ? styles.switchOn : ""}`}
            onClick={() => setAiRepliesEnabled((v) => !v)}
          >
            <span className={styles.switchKnob} />
          </button>
          <div className={styles.rowText}>
            <label className={styles.rowTitle}>AI replies</label>
            <p className={styles.rowDesc}>
              Master switch for this agent. When <strong>on</strong>, the AI answers customers (per-conversation Human/AI toggles still apply). Turn it <strong>off</strong> to route <strong>every</strong> message to you — the AI won&apos;t reply to any conversation until you switch it back on.
            </p>
          </div>
        </div>

        <div className={styles.row}>
          <button
            type="button"
            role="switch"
            aria-checked={replyGuardEnabled}
            className={`${styles.switch} ${replyGuardEnabled ? styles.switchOn : ""}`}
            onClick={() => setReplyGuardEnabled((v) => !v)}
          >
            <span className={styles.switchKnob} />
          </button>
          <div className={styles.rowText}>
            <label className={styles.rowTitle}>Reply guard</label>
            <p className={styles.rowDesc}>
              When <strong>on</strong>, a second AI reviews every reply before it&apos;s sent — trimming repetitive answers, escalating to you, or holding back a reply it judges unnecessary. <strong>Off by default:</strong> the guard can be over-cautious and stay silent when a reply was actually warranted, so leave it off while testing conversations. Turn it on once you want the extra polish.
            </p>
          </div>
        </div>

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

        <div className={styles.row}>
          <button
            type="button"
            role="switch"
            aria-checked={pauseOnAiHandoff}
            className={`${styles.switch} ${pauseOnAiHandoff ? styles.switchOn : ""}`}
            onClick={() => setPauseOnAiHandoff((v) => !v)}
          >
            <span className={styles.switchKnob} />
          </button>
          <div className={styles.rowText}>
            <label className={styles.rowTitle}>Auto-pause when AI asks for human help</label>
            <p className={styles.rowDesc}>
              The AI is told to call a handoff tool when a customer is frustrated, asks to speak to a human, or asks something sensitive (refunds, complaints, custom quotes). When this is on, calling that tool pauses the AI for the conversation and surfaces it on your dashboard. Turn it off if you want the AI to stay engaged even after flagging a handoff.
            </p>
          </div>
        </div>

        <div className={styles.row}>
          <button
            type="button"
            role="switch"
            aria-checked={pauseOnQualifiedLead}
            className={`${styles.switch} ${pauseOnQualifiedLead ? styles.switchOn : ""}`}
            onClick={() => setPauseOnQualifiedLead((v) => !v)}
          >
            <span className={styles.switchKnob} />
          </button>
          <div className={styles.rowText}>
            <label className={styles.rowTitle}>Auto-pause when AI qualifies a lead</label>
            <p className={styles.rowDesc}>
              When the AI detects a customer has confirmed clear buying intent (specific product, quantity, budget, or timeline), it marks a lead and — with this on — pauses so a salesperson can close the deal personally. Turn it off if you want the AI to continue nurturing leads itself.
            </p>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowText}>
            <label className={styles.rowTitle} htmlFor="autoResume">Switch back to AI automatically</label>
            <p className={styles.rowDesc}>
              When a conversation is being handled by a human, hand it back to the AI after this much
              inactivity — so the AI keeps responding if the customer messages again later. Choose
              {" "}<strong>Off</strong> to keep it paused until you resume it yourself.
            </p>
            <select
              id="autoResume"
              className={styles.select}
              value={autoResumeAiAfterMinutes}
              onChange={(e) => setAutoResumeAiAfterMinutes(Number(e.target.value))}
            >
              <option value={0}>Off</option>
              <option value={30}>After 30 minutes</option>
              <option value={60}>After 1 hour</option>
              <option value={120}>After 2 hours</option>
              <option value={240}>After 4 hours</option>
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowText}>
            <label className={styles.rowTitle} htmlFor="replyDelay">Wait before replying</label>
            <p className={styles.rowDesc}>
              Hold each reply for a few seconds so the AI feels less robotic — and if the customer
              fires several messages in a row within that window, the AI waits for them to finish and
              answers them all in <strong>one</strong> combined reply instead of one reply per message.
              Choose <strong>Off</strong> to reply instantly.
            </p>
            <select
              id="replyDelay"
              className={styles.select}
              value={replyDelaySeconds}
              onChange={(e) => setReplyDelaySeconds(Number(e.target.value))}
            >
              <option value={0}>Off (reply instantly)</option>
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" loading={saving} disabled={!isDirty}>
          Save Settings
        </Button>
      </div>

      <DangerZone agent={agent} />
    </form>
  )
}

interface DangerZoneProps {
  agent: AgentPublic
}

function DangerZone({ agent }: DangerZoneProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)

  const expected = agent.businessName?.trim() || agent.id
  const canDelete = typed.trim() === expected && !deleting

  const handleDelete = async (e: React.MouseEvent) => {
    // Prevent the surrounding form's submit handler from firing.
    e.preventDefault()
    if (!canDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        showToast(body?.error || "Failed to delete agent.", "error")
        return
      }
      showToast("Agent deleted.")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      router.push("/dashboard")
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={styles.dangerSection}>
      <h2 className={styles.dangerTitle}>Danger zone</h2>
      <p className={styles.dangerDesc}>
        Deleting this agent disconnects its WhatsApp session and permanently removes all of its conversations, messages, broadcasts, follow-up campaigns, and configuration. This cannot be undone.
      </p>

      {!confirming ? (
        <button
          type="button"
          className={styles.dangerBtn}
          onClick={(e) => { e.preventDefault(); setConfirming(true) }}
        >
          Delete agent…
        </button>
      ) : (
        <div className={styles.confirmBlock}>
          <label className={styles.confirmLabel}>
            Type <code>{expected}</code> to confirm:
          </label>
          <input
            type="text"
            className={styles.confirmInput}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            disabled={deleting}
          />
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={handleDelete}
              disabled={!canDelete}
            >
              {deleting ? "Deleting…" : "Permanently delete this agent"}
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={(e) => { e.preventDefault(); setConfirming(false); setTyped("") }}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgentSettingsTab
