"use client"

import { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { cn, formatTime, formatDuration, getCallerIdentifier, toE164 } from "@/lib/utils"
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
  const queryClient = useQueryClient()
  const { data: detail, isLoading: loading, error: queryError } = useConversationDetail(conversationId)

  // If the detail fetch discovered a phone number the list didn't have,
  // patch the list cache directly (no DB round-trip needed — avoids race condition)
  useEffect(() => {
    if (detail?.user_id && !convMeta?.user_id && agentId && conversationId) {
      queryClient.setQueryData<{ conversations: Conversation[]; has_more: boolean; next_cursor: string | null }>(
        ["chats", agentId],
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.conversation_id === conversationId
                ? { ...c, user_id: detail.user_id }
                : c
            ),
          }
        }
      )
    }
  }, [detail?.user_id, convMeta?.user_id, agentId, conversationId, queryClient])

  const [summary, setSummary] = useState("")
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState("")
  const [summaryDone, setSummaryDone] = useState(false)
  const [isLead, setIsLead] = useState(initialIsLead)
  const [leadLoading, setLeadLoading] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const [templates, setTemplates] = useState<{ id: string; name: string; content: string }[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [followup, setFollowup] = useState("")
  const [followupLoading, setFollowupLoading] = useState(false)
  const [followupError, setFollowupError] = useState("")
  const [copied, setCopied] = useState(false)

  const transcriptRef = useRef<HTMLDivElement>(null)

  // Pre-populate summary from ElevenLabs transcript_summary when detail loads
  useEffect(() => {
    if (!detail) return
    if (detail.transcript_summary && !summaryDone) {
      setSummary(detail.transcript_summary)
      setSummaryDone(true)
    }
  }, [detail, summaryDone])

  // Fetch templates once when agentId is available
  useEffect(() => {
    if (!agentId) return
    fetch(`/api/agents/${agentId}/templates`)
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => {})
  }, [agentId])

  // Reset state when switching conversations
  useEffect(() => {
    setSummary("")
    setSummaryDone(false)
    setSummaryError("")
    setIsLead(initialIsLead)
    setFollowup("")
    setFollowupError("")
    setCopied(false)
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

  const generateFollowup = async () => {
    if (!conversationId || !selectedTemplateId || !agentId) return
    setFollowupLoading(true)
    setFollowupError("")
    try {
      const res = await fetch(`/api/conversations/${conversationId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId, agentId }),
      })
      const data = await res.json()
      if (data.error) setFollowupError(data.error)
      else setFollowup(data.message)
    } catch {
      setFollowupError("Failed to generate follow-up")
    } finally {
      setFollowupLoading(false)
    }
  }

  const copyFollowup = () => {
    navigator.clipboard.writeText(followup)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendOnWhatsApp = () => {
    const conv = convMeta ?? detail
    if (!conv || !followup) return
    // Use raw user_id (international digits) — getCallerIdentifier formats for display
    // and adds a leading 0 which toE164 cannot match against dial codes
    const rawPhone = conv.user_id ??
      (conv.metadata as Record<string, unknown> | undefined)?.from_number as string | undefined ??
      (conv.metadata as Record<string, unknown> | undefined)?.caller_id as string | undefined
    if (!rawPhone) return
    const digits = toE164(rawPhone)
    if (!digits) return
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(followup)}`
    window.open(url, "_blank", "noopener,noreferrer")
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
              <span className={styles.metaChip}>⚡ {convMeta?.creditsUsed ?? 0} credits</span>
            </div>

            {/* Recording */}
            {detail.recording_url && (
              <div className={styles.recordingSection}>
                <div className={styles.sectionLabel}>Call Recording</div>
                <audio controls className={styles.recordingPlayer} src={detail.recording_url} />
              </div>
            )}

            {/* Summary — hidden for now */}
            {/* <div className={styles.summarySection}>
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
            </div> */}

            {/* Follow-up */}
            {templates.length > 0 && (
              <div className={styles.followupSection}>
                <div className={styles.summaryHeader}>
                  <div className={styles.sectionLabel}>Follow-up Message</div>
                </div>
                <div className={styles.followupControls}>
                  <select
                    className={styles.templateSelect}
                    value={selectedTemplateId}
                    onChange={e => { setSelectedTemplateId(e.target.value); setFollowup("") }}
                  >
                    <option value="">Pick a template…</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    className={styles.summaryBtn}
                    onClick={generateFollowup}
                    disabled={followupLoading || !selectedTemplateId}
                  >
                    {followupLoading ? "Generating…" : "Generate"}
                  </button>
                </div>
                {followupError && <div className={styles.summaryError}>{followupError}</div>}
                {followup && (
                  <div className={styles.followupOutput}>
                    <p className={styles.followupText}>{followup}</p>
                    <div className={styles.followupActions}>
                      <button className={styles.waBtn} onClick={sendOnWhatsApp}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Send on WhatsApp
                      </button>
                      <button className={styles.copyBtn} onClick={copyFollowup}>
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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
