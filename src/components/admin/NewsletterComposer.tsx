"use client"

import { useState } from "react"
import styles from "./NewsletterComposer.module.css"
import { formatDate } from "@/lib/utils"

type RecipientType = "subscribers" | "users" | "both"

const TEMPLATES = [
  {
    id: "announcement",
    label: "Announcement",
    emoji: "📣",
    defaults: {
      title: "Big news from D-Zero AI",
      body: "We have something exciting to share with you.\n\nWe've been working hard behind the scenes and we're thrilled to announce...",
    },
  },
  {
    id: "feature",
    label: "Feature Update",
    emoji: "✨",
    defaults: {
      title: "New feature just dropped",
      body: "We just shipped something that's going to make your experience even better.\n\nHere's what's new...",
    },
  },
  {
    id: "tip",
    label: "Tip & Insight",
    emoji: "💡",
    defaults: {
      title: "A quick tip to get more from your agent",
      body: "Did you know you can...\n\nHere's a simple tip that can help you get better results from your AI agent...",
    },
  },
  {
    id: "general",
    label: "General",
    emoji: "✉️",
    defaults: { title: "", body: "" },
  },
]

interface RecentSub {
  email: string
  name: string | null
  source: string | null
  createdAt: string
}

interface Props {
  subscriberCount: number
  userCount: number
  recentSubs: RecentSub[]
}

function PreviewModal({ subject, title, body, ctaText, ctaUrl, onClose }: {
  subject: string
  title: string
  body: string
  ctaText: string
  ctaUrl: string
  onClose: () => void
}) {
  const ctaBlock = ctaText && ctaUrl
    ? `<div style="margin:32px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#00dc82;color:#0a0a0a;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:8px;">${ctaText} →</a></div>`
    : ""

  const html = `<div style="background:#0d0d0d;padding:32px 16px;min-height:100%;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <p style="color:#00dc82;font-size:16px;font-weight:800;margin:0 0 24px;">D-Zero AI</p>
      <div style="background:#0f1e15;border:1px solid #1e3a26;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#00dc82,#00a862);height:4px;"></div>
        <div style="padding:36px 40px 40px;">
          <h1 style="margin:0 0 18px;font-size:24px;font-weight:800;color:#e8fdf0;line-height:1.25;">${title || "Your title here"}</h1>
          <div style="color:#8ab89a;font-size:15px;line-height:1.75;">${(body || "Your message here...").replace(/\n/g, "<br>")}</div>
          ${ctaBlock}
        </div>
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#4a6b56;">You're receiving this from D-Zero AI · dailzero.com</p>
    </div>
  </div>`

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <div className={styles.previewMeta}>
            <span className={styles.previewMetaLabel}>Subject:</span>
            <span className={styles.previewMetaVal}>{subject || "(no subject)"}</span>
          </div>
          <button className={styles.previewClose} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.previewBody}>
          <iframe srcDoc={html} className={styles.previewFrame} title="Email preview" />
        </div>
      </div>
    </div>
  )
}

export function NewsletterComposer({ subscriberCount, userCount, recentSubs }: Props) {
  const [subject, setSubject] = useState("")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [ctaText, setCtaText] = useState("")
  const [ctaUrl, setCtaUrl] = useState("")
  const [recipientType, setRecipientType] = useState<RecipientType>("both")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number } | null>(null)
  const [error, setError] = useState("")
  const [showPreview, setShowPreview] = useState(false)

  const recipientCount =
    recipientType === "subscribers" ? subscriberCount :
    recipientType === "users" ? userCount :
    subscriberCount + userCount

  function applyTemplate(t: typeof TEMPLATES[0]) {
    setTitle(t.defaults.title)
    setBody(t.defaults.body)
  }

  async function handleSend() {
    if (!subject.trim() || !title.trim() || !body.trim()) {
      setError("Subject, title, and body are required.")
      return
    }
    setError("")
    setSending(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, title, body, ctaText, ctaUrl, recipientType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setResult({ sent: data.sent })
    } catch (e: any) {
      setError(e.message || "Failed to send")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.composer}>

        {/* Template picker */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Template</div>
          <div className={styles.templateGrid}>
            {TEMPLATES.map((t) => (
              <button key={t.id} className={styles.templateCard} onClick={() => applyTemplate(t)}>
                <span className={styles.templateEmoji}>{t.emoji}</span>
                <span className={styles.templateLabel}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Subject Line</div>
          <input
            className={styles.input}
            placeholder="e.g. Exciting news from D-Zero AI 🚀"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Title */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Email Title</div>
          <input
            className={styles.input}
            placeholder="Large headline shown at the top of the email"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Message Body</div>
          <textarea
            className={styles.textarea}
            placeholder="Write your message here. Use new lines to create paragraphs."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
          />
        </div>

        {/* CTA */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Call to Action <span className={styles.optional}>(optional)</span></div>
          <div className={styles.ctaRow}>
            <input
              className={styles.input}
              placeholder="Button label, e.g. Try it now"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
            />
            <input
              className={styles.input}
              placeholder="URL, e.g. https://dailzero.com"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
            />
          </div>
        </div>

        {/* Recipients */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Send To</div>
          <div className={styles.recipientGrid}>
            {([
              { id: "both", label: "Everyone", desc: `${subscriberCount + userCount} recipients`, sub: "Subscribers + active users" },
              { id: "subscribers", label: "Subscribers Only", desc: `${subscriberCount} recipients`, sub: "Footer sign-ups" },
              { id: "users", label: "Active Users Only", desc: `${userCount} recipients`, sub: "Approved accounts" },
            ] as { id: RecipientType; label: string; desc: string; sub: string }[]).map((r) => (
              <button
                key={r.id}
                className={`${styles.recipientCard} ${recipientType === r.id ? styles.recipientCardActive : ""}`}
                onClick={() => setRecipientType(r.id)}
              >
                <span className={styles.recipientLabel}>{r.label}</span>
                <span className={styles.recipientCount}>{r.desc}</span>
                <span className={styles.recipientSub}>{r.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && <p className={styles.error}>{error}</p>}

        {/* Success */}
        {result && (
          <div className={styles.success}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Newsletter sent to {result.sent} recipients.
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.previewBtn} onClick={() => setShowPreview(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            Preview
          </button>
          <button className={styles.sendBtn} onClick={handleSend} disabled={sending}>
            {sending ? (
              <>Sending to {recipientCount}…</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Send to {recipientCount} recipients
              </>
            )}
          </button>
        </div>
      </div>

      {/* Recent subscribers sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarTitle}>Recent Subscribers</div>
        {recentSubs.length === 0 ? (
          <p className={styles.empty}>No subscribers yet.</p>
        ) : (
          <div className={styles.subList}>
            {recentSubs.map((s) => (
              <div key={s.email} className={styles.subItem}>
                <div className={styles.subEmail}>{s.email}</div>
                <div className={styles.subMeta}>
                  {s.source && <span className={styles.subSource}>{s.source}</span>}
                  <span className={styles.subDate}>{formatDate(s.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.sidebarTitle} style={{ marginTop: "1.5rem" }}>Tips</div>
        <ul className={styles.tipList}>
          <li>Keep subject lines under 50 characters for best open rates.</li>
          <li>One clear CTA performs better than multiple links.</li>
          <li>Send on Tuesday–Thursday mornings for higher engagement.</li>
        </ul>
      </div>

      {showPreview && (
        <PreviewModal
          subject={subject}
          title={title}
          body={body}
          ctaText={ctaText}
          ctaUrl={ctaUrl}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
