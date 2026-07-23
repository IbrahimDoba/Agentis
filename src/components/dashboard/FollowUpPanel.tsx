"use client"

import { useState, useEffect, useCallback } from "react"
import styles from "./FollowUpPanel.module.css"
import { useVisibleInterval } from "@/lib/useVisibleInterval"

type CampaignStatus = "scanning" | "review" | "scheduled" | "sending" | "completed" | "cancelled" | "failed"
type MessageStatus = "pending" | "approved" | "rejected" | "scheduled" | "sent" | "skipped" | "failed"

interface FollowUpMessage {
  id: string
  contactName: string | null
  phoneNumber: string
  aiReason: string | null
  generatedMessage: string
  status: MessageStatus
  scheduledAt: string | null
  sentAt: string | null
  error: string | null
}

interface FollowUpCampaign {
  id: string
  status: CampaignStatus
  mode: "auto" | "review"
  totalScanned: number
  totalFound: number
  totalSent: number
  totalSkipped: number
  createdAt: string
  completedAt: string | null
  messages?: FollowUpMessage[]
  _count?: { messages: number }
}

interface Props {
  agentId: string
  isConnected: boolean
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  scanning: "Scanning…",
  review: "Ready to Review",
  scheduled: "Scheduled",
  sending: "Sending",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
}

const STATUS_COLOR: Record<CampaignStatus, string> = {
  scanning: "#f59e0b",
  review: "#3b82f6",
  scheduled: "#8b5cf6",
  sending: "#10b981",
  completed: "#6b7280",
  cancelled: "#6b7280",
  failed: "#ef4444",
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
}

function CampaignBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={styles.badge}
      style={{
        background: `${STATUS_COLOR[status]}18`,
        color: STATUS_COLOR[status],
        border: `1px solid ${STATUS_COLOR[status]}35`,
      }}
    >
      {status === "scanning" && <span className={styles.spinner} />}
      {STATUS_LABEL[status]}
    </span>
  )
}

// ─── Setup Modal ────────────────────────────────────────────────────────────

function SetupModal({ onStart, onClose }: {
  onStart: (mode: "auto" | "review", minDays: number, includeAll: boolean) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<"auto" | "review">("review")
  const [minDays, setMinDays] = useState(1)
  const [includeAll, setIncludeAll] = useState(false)

  // Lock the page behind the modal so a scroll gesture scrolls the modal, not
  // the page underneath it.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Start Follow-up Campaign</h2>
            <p className={styles.modalSub}>AI will scan conversations and draft personalised messages.</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.setupSection}>
          <label className={styles.setupLabel}>Minimum days since last message</label>
          <p className={styles.setupDesc}>Only conversations silent for this many days will be included.</p>
          <div className={styles.daysRow}>
            {[1, 2, 3, 7].map((d) => (
              <button
                key={d}
                className={`${styles.dayBtn} ${minDays === d ? styles.dayBtnActive : ""}`}
                onClick={() => setMinDays(d)}
              >
                {d === 1 ? "1 day" : `${d} days`}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.setupSection}>
          <label className={styles.setupLabel}>Who to message</label>
          <div className={styles.modeCards}>
            <button
              className={`${styles.modeCard} ${!includeAll ? styles.modeCardActive : ""}`}
              onClick={() => setIncludeAll(false)}
            >
              <span className={styles.modeIcon}>🎯</span>
              <div>
                <div className={styles.modeName}>AI picks</div>
                <div className={styles.modeDesc}>Only contacts the AI judges worth a follow-up.</div>
              </div>
            </button>
            <button
              className={`${styles.modeCard} ${includeAll ? styles.modeCardActive : ""}`}
              onClick={() => setIncludeAll(true)}
            >
              <span className={styles.modeIcon}>📢</span>
              <div>
                <div className={styles.modeName}>Message everyone</div>
                <div className={styles.modeDesc}>A personalised message for every contact — you review and pick who sends.</div>
              </div>
            </button>
          </div>
        </div>

        {includeAll ? (
          <div className={styles.setupSection}>
            <p className={styles.setupDesc}>Every message goes to <strong>review</strong> first — you choose who actually gets sent.</p>
          </div>
        ) : (
          <div className={styles.setupSection}>
            <label className={styles.setupLabel}>Send mode</label>
            <div className={styles.modeCards}>
              <button
                className={`${styles.modeCard} ${mode === "review" ? styles.modeCardActive : ""}`}
                onClick={() => setMode("review")}
              >
                <span className={styles.modeIcon}>👀</span>
                <div>
                  <div className={styles.modeName}>Review first</div>
                  <div className={styles.modeDesc}>See and approve each message before it sends.</div>
                </div>
              </button>
              <button
                className={`${styles.modeCard} ${mode === "auto" ? styles.modeCardActive : ""}`}
                onClick={() => setMode("auto")}
              >
                <span className={styles.modeIcon}>⚡</span>
                <div>
                  <div className={styles.modeName}>Send automatically</div>
                  <div className={styles.modeDesc}>AI drafts and sends all messages without review.</div>
                </div>
              </button>
            </div>
          </div>
        )}

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.startBtn} onClick={() => onStart(includeAll ? "review" : mode, minDays, includeAll)}>
            Start Scanning →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Campaign Detail Modal ───────────────────────────────────────────────────

function CampaignDetailModal({ campaign, agentId, onClose, onRefresh }: {
  campaign: FollowUpCampaign
  agentId: string
  onClose: () => void
  onRefresh: () => void
}) {
  const [detail, setDetail] = useState<FollowUpCampaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/followup-campaigns/${campaign.id}`)
    if (res.ok) {
      const data = await res.json()
      setDetail(data.campaign)
    }
    setLoading(false)
  }, [agentId, campaign.id])

  // Initial load on mount.
  useEffect(() => {
    load()
  }, [load])

  // Lock the page behind the modal so scrolling scrolls the modal, not the page.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  // Poll only while the campaign is actively working AND the tab is visible.
  const detailActive = detail?.status === "scanning" || detail?.status === "sending"
  useVisibleInterval(load, 3000, detailActive)

  const callApproveApi = async (body: object) => {
    await fetch(`/api/agents/${agentId}/followup-campaigns/${campaign.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  const handleApprove = async (messageId?: string) => {
    setApproving(true)
    await callApproveApi(messageId
      ? { action: "approve", messageIds: [messageId] }
      : { action: "approve" }
    )
    await load()
    setApproving(false)
  }

  const handleUnapprove = async (messageId: string) => {
    await callApproveApi({ action: "pending", messageIds: [messageId] })
    await load()
  }

  const handleReject = async (messageId: string) => {
    await callApproveApi({ action: "reject", messageIds: [messageId] })
    await load()
  }

  const handleStart = async () => {
    setStarting(true)
    await fetch(`/api/agents/${agentId}/followup-campaigns/${campaign.id}/start`, { method: "POST" })
    await load()
    onRefresh()
    setStarting(false)
  }

  const handleCancel = async () => {
    setCancelling(true)
    await fetch(`/api/agents/${agentId}/followup-campaigns/${campaign.id}/cancel`, { method: "POST" })
    await load()
    onRefresh()
    setCancelling(false)
    setConfirmCancel(false)
  }

  const handleResume = async () => {
    setResuming(true)
    setResumeError(null)
    try {
      const res = await fetch(
        `/api/agents/${agentId}/followup-campaigns/${campaign.id}/resume`,
        { method: "POST" }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResumeError(data?.error || "Couldn't resume — try again or check the worker logs.")
      } else {
        await load()
        onRefresh()
      }
    } finally {
      setResuming(false)
    }
  }

  const c = detail ?? campaign
  const messages = detail?.messages ?? []
  const pending = messages.filter((m) => m.status === "pending")
  const approved = messages.filter((m) => m.status === "approved")
  const sent = messages.filter((m) => m.status === "sent")
  const isSending = c.status === "sending"
  const isReview = c.status === "review"
  const isScanning = c.status === "scanning"

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitleRow}>
              <h2 className={styles.modalTitle}>Follow-up Campaign</h2>
              <CampaignBadge status={c.status} />
            </div>
            <p className={styles.modalSub}>
              {isScanning
                ? `Scanning conversations…`
                : `${c.totalScanned} scanned · ${c.totalFound} found · ${c.totalSent} sent`}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Progress bar for sending */}
        {(isSending || c.status === "completed") && c.totalFound > 0 && (
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.round((c.totalSent / c.totalFound) * 100)}%` }}
              />
            </div>
            <span className={styles.progressLabel}>
              {c.totalSent} / {c.totalFound} sent
            </span>
          </div>
        )}

        {/* Scanning state */}
        {isScanning && (
          <div className={styles.scanningState}>
            <div className={styles.scanSpinner} />
            <div>
              <div className={styles.scanTitle}>AI is scanning your conversations…</div>
              <div className={styles.scanSub}>This usually takes 15–60 seconds.</div>
            </div>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: cancelling ? "not-allowed" : "pointer" }}
            >
              {cancelling ? "Cancelling…" : "Cancel scan"}
            </button>
          </div>
        )}

        {/* No results */}
        {isReview && messages.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>✓</div>
            <div className={styles.emptyTitle}>All caught up</div>
            <div className={styles.emptySub}>No conversations needed a follow-up right now.</div>
          </div>
        )}

        {/* Message list */}
        {messages.length > 0 && (
          <div className={styles.messageList}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.msgCard} ${
                  msg.status === "sent" ? styles.msgCardSent :
                  msg.status === "rejected" ? styles.msgCardRejected :
                  msg.status === "approved" ? styles.msgCardApproved : ""
                }`}
              >
                <div className={styles.msgTop}>
                  <div className={styles.msgContact}>
                    <span className={styles.msgAvatar}>
                      {(msg.contactName ?? msg.phoneNumber).slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <div className={styles.msgName}>{msg.contactName ?? msg.phoneNumber}</div>
                      <div className={styles.msgPhone}>{msg.phoneNumber}</div>
                    </div>
                  </div>
                  <div className={styles.msgStatusBadge} data-status={msg.status}>
                    {msg.status === "sent" ? "✓ Sent" :
                     msg.status === "approved" ? "✓ Approved" :
                     msg.status === "rejected" ? "Skipped" :
                     msg.status === "scheduled" ? "Scheduled" :
                     msg.status === "failed" ? "Failed" : "Pending"}
                  </div>
                </div>

                {msg.aiReason && (
                  <div className={styles.msgReason}>💡 {msg.aiReason}</div>
                )}

                {editingId === msg.id ? (
                  <textarea
                    className={styles.msgEditArea}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                  />
                ) : (
                  <div className={styles.msgText}>{msg.generatedMessage}</div>
                )}

                {msg.sentAt && (
                  <div className={styles.msgSentAt}>Sent {formatTime(msg.sentAt)}</div>
                )}
                {msg.scheduledAt && msg.status === "scheduled" && (
                  <div className={styles.msgSentAt}>Scheduled for {formatTime(msg.scheduledAt)}</div>
                )}
                {msg.status === "failed" && msg.error && (
                  <div className={styles.msgError} title={msg.error}>
                    ⚠ {msg.error.length > 140 ? msg.error.slice(0, 140) + "…" : msg.error}
                  </div>
                )}

                {/* Actions for pending messages */}
                {isReview && msg.status === "pending" && (
                  <div className={styles.msgActions}>
                    {editingId === msg.id ? (
                      <>
                        <button className={styles.msgApproveBtn} onClick={() => {
                          setEditingId(null)
                          handleApprove(msg.id)
                        }}>Approve</button>
                        <button className={styles.msgEditCancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className={styles.msgApproveBtn} onClick={() => handleApprove(msg.id)} disabled={approving}>
                          Approve
                        </button>
                        <button className={styles.msgEditBtn} onClick={() => {
                          setEditingId(msg.id)
                          setEditText(msg.generatedMessage)
                        }}>Edit</button>
                        <button className={styles.msgRejectBtn} onClick={() => handleReject(msg.id)}>
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Unapprove button for approved messages */}
                {isReview && msg.status === "approved" && (
                  <div className={styles.msgActions}>
                    <button className={styles.msgRejectBtn} onClick={() => handleUnapprove(msg.id)}>
                      Undo approval
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className={styles.modalFooter}>
          {isReview && messages.length > 0 && (
            <>
              {c.mode === "review" && pending.length > 0 && (
                <button className={styles.approveAllBtn} onClick={() => handleApprove()} disabled={approving}>
                  {approving ? "Approving…" : `Approve all (${pending.length})`}
                </button>
              )}
              <button
                className={styles.startBtn}
                onClick={handleStart}
                disabled={starting || (c.mode === "review" && approved.length === 0 && pending.length === 0)}
              >
                {starting ? "Starting…" :
                 c.mode === "auto" ? `Send all (${messages.length})` :
                 `Send approved (${approved.length})`}
              </button>
            </>
          )}

          {(isSending || c.status === "scheduled") && (
            confirmCancel ? (
              <>
                <span className={styles.confirmText}>Stop sending and cancel?</span>
                <button className={styles.cancelCampaignBtn} onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button className={styles.cancelBtn} onClick={() => setConfirmCancel(false)}>Keep going</button>
              </>
            ) : (
              <button className={styles.cancelCampaignBtn} onClick={() => setConfirmCancel(true)}>
                Cancel Campaign
              </button>
            )
          )}

          {(c.status === "failed" || isSending) && (
            <>
              {resumeError && <span className={styles.confirmText}>⚠ {resumeError}</span>}
              <button
                className={styles.startBtn}
                onClick={handleResume}
                disabled={resuming}
                title="Re-queue any messages that were scheduled but never sent (e.g. after a WhatsApp reconnect) and give them a fresh send schedule. Already-sent messages are never re-sent."
              >
                {resuming ? "Resuming…" : isSending ? "Resend unsent" : "Resume Campaign"}
              </button>
            </>
          )}

          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function FollowUpPanel({ agentId, isConnected }: Props) {
  const [campaigns, setCampaigns] = useState<FollowUpCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [activeCampaign, setActiveCampaign] = useState<FollowUpCampaign | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  const loadCampaigns = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/followup-campaigns`)
    if (res.ok) {
      const data = await res.json()
      setCampaigns(data.campaigns ?? [])
    }
    setLoading(false)
  }, [agentId])

  // Initial load on mount.
  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  // Previously polled every 5s forever. Now only while a campaign is actively
  // scanning/sending AND the tab is visible — idle dashboards stop polling.
  const hasActiveCampaign = campaigns.some(
    (c) => c.status === "scanning" || c.status === "sending"
  )
  useVisibleInterval(loadCampaigns, 5000, hasActiveCampaign)

  const handleStart = async (mode: "auto" | "review", minDays: number, includeAll: boolean) => {
    setCreating(true)
    setError("")
    setShowSetup(false)
    try {
      const res = await fetch(`/api/agents/${agentId}/followup-campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, minDaysSince: minDays, includeAll }),
      })
      if (!res.ok) throw new Error("Failed to start")
      const data = await res.json()
      await loadCampaigns()
      setActiveCampaign(data.campaign)
    } catch {
      setError("Failed to start campaign. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  const activeScan = campaigns.find((c) => c.status === "scanning" || c.status === "sending")

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>AI Follow-up Campaigns</h2>
          <p className={styles.panelSub}>
            Let the AI scan your conversations, find who needs a follow-up, and send personalised messages spread over 24 hours.
          </p>
        </div>
        <button
          className={styles.newCampaignBtn}
          onClick={() => setShowSetup(true)}
          disabled={!isConnected || creating || !!activeScan}
          title={!isConnected ? "WhatsApp not connected" : activeScan ? "A campaign is already running" : ""}
        >
          {creating ? "Starting…" : "✦ Start Campaign"}
        </button>
      </div>

      {!isConnected && (
        <div className={styles.warningBanner}>
          ⚠ WhatsApp is not connected. Connect in Channels before starting a campaign.
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.loadingRow}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className={styles.emptyPanel}>
          <div className={styles.emptyPanelIcon}>🎯</div>
          <div className={styles.emptyPanelTitle}>No campaigns yet</div>
          <div className={styles.emptyPanelSub}>
            Start a campaign to automatically follow up on conversations that went cold.
          </div>
        </div>
      ) : (
        <div className={styles.campaignList}>
          {campaigns.map((c) => (
            <button
              key={c.id}
              className={styles.campaignRow}
              onClick={() => setActiveCampaign(c)}
            >
              <div className={styles.campaignRowLeft}>
                <CampaignBadge status={c.status} />
                <div className={styles.campaignStats}>
                  <span>{c.totalFound} found</span>
                  <span>·</span>
                  <span>{c.totalSent} sent</span>
                  {c.totalSkipped > 0 && <><span>·</span><span>{c.totalSkipped} skipped</span></>}
                </div>
              </div>
              <div className={styles.campaignRowRight}>
                <span className={styles.campaignDate}>{formatTime(c.createdAt)}</span>
                <span className={styles.campaignArrow}>›</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showSetup && (
        <SetupModal onStart={handleStart} onClose={() => setShowSetup(false)} />
      )}

      {activeCampaign && (
        <CampaignDetailModal
          campaign={activeCampaign}
          agentId={agentId}
          onClose={() => setActiveCampaign(null)}
          onRefresh={loadCampaigns}
        />
      )}
    </div>
  )
}
