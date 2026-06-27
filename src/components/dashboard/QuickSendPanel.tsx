"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  ArrowPathIcon,
  PaperAirplaneIcon,
  PauseCircleIcon,
} from "@heroicons/react/24/outline"
import { Input, Textarea } from "@/components/ui/Input"
import styles from "./BroadcastsPanel.module.css"

interface QuickSendPanelProps {
  agentId: string
  isConnected: boolean
  warmupTier?: number
}

export function QuickSendPanel({ agentId, isConnected, warmupTier }: QuickSendPanelProps) {
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)

  const sendMessage = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to send message")
      return data
    },
    onSuccess: () => {
      setFeedback("Message sent — it’ll show in the inbox for this number.")
      setMessage("")
      setPhone("")
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const canSubmit =
    isConnected && phone.replace(/\D/g, "").length >= 7 && message.trim().length > 0

  if (!isConnected) {
    return (
      <div className={styles.locked}>
        <PauseCircleIcon width={24} height={24} />
        <div>
          <div className={styles.lockedTitle}>Connect WhatsApp before sending</div>
          <div className={styles.lockedText}>
            Direct sends only unlock once the WhatsApp Web session is live, so we can verify numbers and enforce warmup limits.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Send a message</h2>
          <p className={styles.subtitle}>Message any WhatsApp number directly — we verify it’s on WhatsApp first.</p>
        </div>
        <div className={styles.pill}>Warmup Tier {warmupTier ?? 1}</div>
      </div>

      {feedback && <div className={styles.feedback}>{feedback}</div>}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>Compose</div>
            <div className={styles.cardSubtitle}>One number, one message.</div>
          </div>
        </div>

        <Input
          label="WhatsApp number"
          placeholder="2348012345678"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setFeedback(null) }}
          hint="Include the country code, or start a local number with 0 — symbols and spaces are fine."
          inputMode="tel"
        />

        <Textarea
          label="Message"
          placeholder="Hi! Quick note from us..."
          value={message}
          onChange={(e) => { setMessage(e.target.value); setFeedback(null) }}
          rows={6}
          maxLength={1000}
          hint="Up to 1000 characters."
        />

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{message.trim().length}</div>
            <div className={styles.statLabel}>Characters</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{warmupTier ?? 1}</div>
            <div className={styles.statLabel}>Warmup tier</div>
          </div>
        </div>

        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSubmit || sendMessage.isPending}
          onClick={() => sendMessage.mutate()}
        >
          {sendMessage.isPending
            ? <ArrowPathIcon width={16} height={16} className={styles.spin} />
            : <PaperAirplaneIcon width={16} height={16} />}
          {sendMessage.isPending ? "Sending..." : "Send message"}
        </button>
      </section>
    </div>
  )
}
