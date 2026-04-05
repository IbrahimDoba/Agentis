"use client"

import { useState, useEffect, useRef } from "react"
import { cn, formatTime, formatDuration, getCallerIdentifier } from "@/lib/utils"
import { useConversationDetail } from "@/hooks/useConversationDetail"
import type { Conversation } from "@/types"
import styles from "./ConversationDrawer.module.css"

interface TranscriptMessage {
  role: "user" | "agent"
  message: string | null
  time_in_call_secs: number
  source_medium?: string
  audio_url?: string
  image_url?: string
  video_url?: string
  document_url?: string
  document_name?: string
}

interface ConversationDetail {
  conversation_id: string
  agent_id: string
  agent_name?: string
  user_id?: string | null
  status: string
  call_duration_secs?: number | null
  start_time_unix_secs?: number | null
  message_count?: number | null
  call_successful?: string
  call_summary_title?: string | null
  transcript_summary?: string | null
  main_language?: string | null
  conversation_initiation_source?: string | null
  metadata?: {
    start_time_unix_secs?: number | null
    call_duration_secs?: number | null
    caller_id?: string
    from_number?: string
    phone_call?: { external_number?: string; from?: string }
    [key: string]: unknown
  }
  transcript: TranscriptMessage[]
  recording_url?: string
}

interface ConversationDrawerProps {
  conversationId: string | null
  agentId?: string
  onClose: () => void
  isLead?: boolean
  conversation?: Conversation
}

function SourceIcon({ source }: { source?: string | null }) {
  if (source === "whatsapp") return <span className={styles.sourceChip}>WhatsApp</span>
  if (source) return <span className={styles.sourceChip}>{source}</span>
  return null
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className={styles.lightboxBackdrop} onClick={onClose}>
      <div className={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Full size" className={styles.lightboxImg} />
        <button className={styles.lightboxClose} onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function MediaBubble({ msg, onImageClick }: { msg: TranscriptMessage; onImageClick: (url: string) => void }) {
  const isVoiceNote = msg.source_medium === "audio" && !msg.audio_url

  return (
    <div className={cn(styles.message, msg.role === "user" ? styles.user : styles.agent)}>
      <div className={styles.bubble}>
        {isVoiceNote && (
          <div className={styles.voiceNote}>
            <span className={styles.voiceNoteIcon}>🎤</span>
            <span className={styles.voiceNoteLabel}>Voice note</span>
          </div>
        )}
        {msg.message && <p className={styles.messageText}>{msg.message}</p>}
        {msg.audio_url && (
          <audio controls className={styles.audioPlayer} src={msg.audio_url} />
        )}
        {msg.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.image_url}
            alt="Shared image"
            className={styles.mediaImage}
            onClick={() => onImageClick(msg.image_url!)}
          />
        )}
        {msg.video_url && (
          <video controls className={styles.mediaVideo} src={msg.video_url} />
        )}
        {msg.document_url && (
          <a href={msg.document_url} target="_blank" rel="noopener noreferrer" className={styles.docLink}>
            📄 {msg.document_name ?? "Document"}
          </a>
        )}
      </div>
      <div className={styles.msgTime}>
        {Math.floor(msg.time_in_call_secs / 60)}:{String(msg.time_in_call_secs % 60).padStart(2, "0")}
      </div>
    </div>
  )
}

export function ConversationDrawer({ conversationId, agentId, onClose, isLead: initialIsLead = false, conversation: convMeta }: ConversationDrawerProps) {
  const { data: detail, isLoading: loading, error: queryError } = useConversationDetail(conversationId)

  const [summary, setSummary] = useState("")
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState("")
  const [summaryDone, setSummaryDone] = useState(false)
  const [isLead, setIsLead] = useState(initialIsLead)
  const [leadLoading, setLeadLoading] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)

  // Pre-populate summary from ElevenLabs transcript_summary when detail loads
  useEffect(() => {
    if (!detail) return
    if (detail.transcript_summary && !summaryDone) {
      setSummary(detail.transcript_summary)
      setSummaryDone(true)
    }
  }, [detail, summaryDone])

  // Reset state when switching conversations
  useEffect(() => {
    setSummary("")
    setSummaryDone(false)
    setSummaryError("")
    setIsLead(initialIsLead)
  }, [conversationId, initialIsLead])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const toggleLead = async () => {
    if (!conversationId || !agentId) return
    setLeadLoading(true)
    try {
      const callerNumber = convMeta ? getCallerIdentifier(convMeta) : (detail ? getCallerIdentifier(detail) : null)
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          agentId,
          callerNumber,
          summary: convMeta?.transcript_summary ?? detail?.transcript_summary ?? null,
        }),
      })
      const data = await res.json()
      setIsLead(!data.removed)
    } catch {
      // silently fail
    } finally {
      setLeadLoading(false)
    }
  }

  const generateSummary = async () => {
    if (!conversationId) return
    setSummaryLoading(true)
    setSummaryError("")
    try {
      const res = await fetch(`/api/conversations/${conversationId}/summary`, { method: "POST" })
      const data = await res.json()
      if (data.error) setSummaryError(data.error)
      else { setSummary(data.summary); setSummaryDone(true) }
    } catch {
      setSummaryError("Failed to generate summary")
    } finally {
      setSummaryLoading(false)
    }
  }

  if (!conversationId) return null

  const caller = detail ? getCallerIdentifier(detail) : null
  const title = detail?.call_summary_title || caller || "Conversation"
  const subline = detail?.call_summary_title && caller && caller !== detail.call_summary_title
    ? caller
    : null
  const startTime = detail?.start_time_unix_secs ?? detail?.metadata?.start_time_unix_secs
  const duration = detail?.call_duration_secs ?? detail?.metadata?.call_duration_secs
  const msgCount = detail?.message_count ?? detail?.transcript?.length ?? 0

  return (
    <>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <aside className={styles.drawer}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitleGroup}>
            <div className={styles.drawerTitle}>{title}</div>
            {subline && <div className={styles.drawerSub}>{subline}</div>}
          </div>
          <div className={styles.headerActions}>
            <button
              className={cn(styles.leadBtn, isLead ? styles.leadBtnActive : undefined)}
              onClick={toggleLead}
              disabled={leadLoading}
              title={isLead ? "Remove lead" : "Mark as lead"}
            >
              {isLead ? "🔥 Lead" : "Mark as Lead"}
            </button>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          </div>
        </div>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading conversation…</span>
          </div>
        )}

        {queryError && <div className={styles.errorState}>{(queryError as Error).message}</div>}

        {detail && (
          <div className={styles.body}>
            {/* Meta strip */}
            <div className={styles.metaStrip}>
              <span className={cn(
                styles.statusPill,
                detail.status === "done" ? styles.pillDone : styles.pillActive
              )}>
                <span className={styles.pillDot} />
                {detail.status === "done" ? "Completed" : "In Progress"}
              </span>
              {detail.call_successful === "success" && (
                <span className={cn(styles.statusPill, styles.pillSuccess)}>✓ Resolved</span>
              )}
              {detail.call_successful === "failure" && (
                <span className={cn(styles.statusPill, styles.pillFailure)}>✗ Unresolved</span>
              )}
              <SourceIcon source={detail.conversation_initiation_source} />
              <span className={styles.metaChip}>{formatTime(startTime)}</span>
              <span className={styles.metaChip}>{formatDuration(duration)}</span>
              <span className={styles.metaChip}>{msgCount} {msgCount === 1 ? "msg" : "msgs"}</span>
            </div>

            {/* Recording */}
            {detail.recording_url && (
              <div className={styles.recordingSection}>
                <div className={styles.sectionLabel}>Call Recording</div>
                <audio controls className={styles.recordingPlayer} src={detail.recording_url} />
              </div>
            )}

            {/* Summary */}
            <div className={styles.summarySection}>
              <div className={styles.summaryHeader}>
                <div className={styles.sectionLabel}>AI Summary</div>
                <button
                  className={styles.summaryBtn}
                  onClick={generateSummary}
                  disabled={summaryLoading}
                >
                  {summaryLoading ? "Generating…" : summaryDone ? "Regenerate" : "Generate Summary"}
                </button>
              </div>
              {summaryError && <div className={styles.summaryError}>{summaryError}</div>}
              {summary ? (
                <p className={styles.summaryText}>{summary}</p>
              ) : (
                <p className={styles.summaryPlaceholder}>
                  Click &ldquo;Generate Summary&rdquo; to get an AI-powered overview of this conversation.
                </p>
              )}
            </div>

            {/* Transcript */}
            <div className={styles.sectionLabel} style={{ marginBottom: "0.75rem" }}>Transcript</div>
            <div className={styles.transcript} ref={transcriptRef}>
              {!detail.transcript?.length ? (
                <div className={styles.emptyTranscript}>No transcript available</div>
              ) : (
                detail.transcript
                  .filter((msg: TranscriptMessage) => msg.message?.trim() || msg.source_medium === "audio" || msg.audio_url || msg.image_url || msg.video_url || msg.document_url)
                  .map((msg: TranscriptMessage, i: number) => <MediaBubble key={i} msg={msg} onImageClick={setLightboxSrc} />)
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

export default ConversationDrawer
