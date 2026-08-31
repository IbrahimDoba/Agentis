"use client"

import { useState } from "react"
import styles from "./OutreachReview.module.css"

// The review queue. One draft at a time rather than a table: the decision needs
// the copy, the cited evidence and the demo side by side, and a list view makes
// it too easy to approve on vibes.

export type ReviewItem = {
  id: string
  subject: string
  bodyText: string
  aiReason: string | null
  signals: { claim: string; sourceUrl: string }[]
  toEmail: string
  step: number
  createdAt: string
  businessName: string
  vertical: string | null
  city: string | null
  fitScore: number
  sourceLabel: string
  sourceUrl: string
  demoUrl: string | null
}

type Props = {
  items: ReviewItem[]
  approved: number
  sentToday: number
  cap: number
}

export function OutreachReview({ items, approved, sentToday, cap }: Props) {
  const [queue, setQueue] = useState(items)
  const [subject, setSubject] = useState(items[0]?.subject ?? "")
  const [body, setBody] = useState(items[0]?.bodyText ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [approvedCount, setApprovedCount] = useState(approved)

  const current = queue[0]

  function advance() {
    const rest = queue.slice(1)
    setQueue(rest)
    setSubject(rest[0]?.subject ?? "")
    setBody(rest[0]?.bodyText ?? "")
  }

  async function review(action: "approve" | "reject") {
    if (!current || busy) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/outreach/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { id: current.id, action, subject, bodyText: body }
            : { id: current.id, action }
        ),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Could not save that review")
        return
      }
      if (action === "approve") setApprovedCount((n) => n + 1)
      advance()
    } finally {
      setBusy(false)
    }
  }

  async function sendApproved() {
    if (busy) return
    setBusy(true)
    setError("")
    setSendResult(null)
    try {
      const res = await fetch("/api/admin/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "Send failed")
        return
      }
      setSendResult(`Sent ${data.sent}, skipped ${data.skipped}, failed ${data.failed}.`)
      setApprovedCount(Math.max(0, approvedCount - (data.sent ?? 0)))
    } finally {
      setBusy(false)
    }
  }

  // Edits are compared against the original so an approve-as-is and an
  // approve-after-rewrite are visibly different actions to the reviewer.
  const edited = current ? subject !== current.subject || body !== current.bodyText : false

  return (
    <div className={styles.wrap}>
      <div className={styles.sendBar}>
        <span className={styles.sendInfo}>
          {approvedCount} approved and waiting. {sentToday} of {cap} sent today.
        </span>
        <button
          type="button"
          className={styles.sendButton}
          onClick={sendApproved}
          disabled={busy || approvedCount === 0}
        >
          {busy ? "Working…" : "Send approved"}
        </button>
      </div>

      {sendResult && <p className={styles.notice}>{sendResult}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!current ? (
        <p className={styles.empty}>
          Nothing to review. Import prospects, then generate drafts.
        </p>
      ) : (
        <div className={styles.grid}>
          <section className={styles.editor}>
            <div className={styles.metaRow}>
              <strong>{current.businessName}</strong>
              <span className={styles.badge}>fit {current.fitScore}</span>
              {current.vertical && <span className={styles.badge}>{current.vertical}</span>}
              {current.city && <span className={styles.badge}>{current.city}</span>}
            </div>
            <p className={styles.to}>To {current.toEmail}</p>

            <label className={styles.label} htmlFor="outreach-subject">
              Subject
            </label>
            <input
              id="outreach-subject"
              className={styles.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
            />

            <label className={styles.label} htmlFor="outreach-body">
              Body {edited && <span className={styles.edited}>edited</span>}
            </label>
            <textarea
              id="outreach-body"
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
            />
            <p className={styles.counter}>{body.trim().split(/\s+/).filter(Boolean).length} words</p>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.approve}
                onClick={() => review("approve")}
                disabled={busy}
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.reject}
                onClick={() => review("reject")}
                disabled={busy}
              >
                Reject
              </button>
              <span className={styles.remaining}>{queue.length} left in this batch</span>
            </div>
          </section>

          <aside className={styles.evidence}>
            <h2 className={styles.evidenceTitle}>Evidence</h2>
            <p className={styles.reason}>{current.aiReason ?? "No rationale recorded."}</p>

            <h3 className={styles.evidenceSub}>Claims and their sources</h3>
            <ul className={styles.signals}>
              {current.signals.map((signal, i) => (
                <li key={i} className={styles.signal}>
                  <span>{signal.claim}</span>
                  <a href={signal.sourceUrl} target="_blank" rel="noreferrer noopener">
                    {signal.sourceUrl}
                  </a>
                </li>
              ))}
              {current.signals.length === 0 && <li className={styles.signal}>None recorded.</li>}
            </ul>

            <h3 className={styles.evidenceSub}>Where we found them</h3>
            <p className={styles.reason}>
              {current.sourceLabel} —{" "}
              <a href={current.sourceUrl} target="_blank" rel="noreferrer noopener">
                {current.sourceUrl}
              </a>
            </p>

            <h3 className={styles.evidenceSub}>Their demo</h3>
            {current.demoUrl ? (
              <a
                className={styles.demoLink}
                href={current.demoUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open and ask it three real questions
              </a>
            ) : (
              <p className={styles.reason}>No demo provisioned.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
