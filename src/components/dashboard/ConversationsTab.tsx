"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChatBubbleLeftRightIcon, PhoneIcon, LockClosedIcon, ArrowPathIcon, ExclamationCircleIcon, UserIcon, CpuChipIcon } from "@heroicons/react/24/outline"
import type { Conversation, TranscriptMessage } from "@/types"
import { getCallerIdentifier } from "@/lib/utils"
import styles from "./ConversationsTab.module.css"

interface ConversationsTabProps {
  agentId: string
  elevenlabsAgentId?: string | null
}

function formatDate(unixSecs: number) {
  const date = new Date(unixSecs * 1000)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isThisYear = date.getFullYear() === now.getFullYear()
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (isThisYear) return date.toLocaleDateString([], { month: "short", day: "numeric" })
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function formatDateFull(unixSecs: number) {
  return new Date(unixSecs * 1000).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatDuration(secs: number) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// Group conversations by phone number, sorted by most recent first
interface CallerGroup {
  phoneNumber: string
  conversations: Conversation[] // sorted oldest → newest
  lastActive: number
  totalMessages: number
}

function groupByPhone(conversations: Conversation[]): CallerGroup[] {
  const map = new Map<string, Conversation[]>()

  for (const conv of conversations) {
    const phone = getCallerIdentifier(conv)
    const existing = map.get(phone) ?? []
    map.set(phone, [...existing, conv])
  }

  return Array.from(map.entries())
    .map(([phoneNumber, convs]) => {
      const sorted = [...convs].sort((a, b) => a.start_time_unix_secs - b.start_time_unix_secs)
      return {
        phoneNumber,
        conversations: sorted,
        lastActive: Math.max(...convs.map((c) => c.start_time_unix_secs)),
        totalMessages: convs.reduce((sum, c) => sum + c.message_count, 0),
      }
    })
    .sort((a, b) => b.lastActive - a.lastActive)
}

function SessionBlock({
  agentId,
  conv,
  sessionIndex,
}: {
  agentId: string
  conv: Conversation
  sessionIndex: number
}) {
  const { data: detail, isLoading } = useQuery<Conversation>({
    queryKey: ["conversation", conv.conversation_id],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/conversations/${conv.conversation_id}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  const messages: TranscriptMessage[] = detail?.transcript ?? []

  return (
    <div>
      <div className={styles.sessionBreak}>
        <div className={styles.sessionBreakLine} />
        <div className={styles.sessionBreakLabel}>
          Session {sessionIndex + 1} — {formatDateFull(conv.start_time_unix_secs)}
          {conv.call_duration_secs ? ` · ${formatDuration(conv.call_duration_secs)}` : ""}
        </div>
        <div className={styles.sessionBreakLine} />
      </div>

      {conv.transcript_summary && (
        <div className={styles.sessionSummary}>
          {conv.transcript_summary}
        </div>
      )}

      {isLoading ? (
        <div className={styles.transcriptEmpty}>
          <ArrowPathIcon width={14} height={14} className={styles.spin} /> Loading…
        </div>
      ) : messages.length === 0 ? (
        <div className={styles.transcriptEmpty}>No transcript for this session.</div>
      ) : (
        messages
          .filter((msg) => msg.message?.trim() || msg.source_medium === "audio" || msg.audio_url || msg.image_url || msg.video_url || msg.document_url)
          .map((msg: TranscriptMessage, i: number) => {
            const isVoiceNote = msg.source_medium === "audio" && !msg.audio_url
            return (
              <div
                key={i}
                className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAgent}`}
              >
                <div className={styles.bubbleIcon}>
                  {msg.role === "user" ? <UserIcon width={12} height={12} /> : <CpuChipIcon width={12} height={12} />}
                </div>
                <div className={styles.bubbleBody}>
                  {isVoiceNote && (
                    <div className={styles.voiceNote}>
                      <span>🎤</span>
                      <span className={styles.voiceNoteLabel}>Voice note</span>
                    </div>
                  )}
                  {msg.message && <div className={styles.bubbleText}>{msg.message}</div>}
                  {msg.audio_url && (
                    <audio controls className={styles.mediaAudio} src={msg.audio_url} />
                  )}
                  {msg.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={msg.image_url} alt="Shared image" className={styles.mediaImage} />
                  )}
                  {msg.video_url && (
                    <video controls className={styles.mediaVideo} src={msg.video_url} />
                  )}
                  {msg.document_url && (
                    <a href={msg.document_url} target="_blank" rel="noopener noreferrer" className={styles.docLink}>
                      📄 {msg.document_name ?? "Document"}
                    </a>
                  )}
                  <div className={styles.bubbleTime}>{formatDuration(msg.time_in_call_secs)}</div>
                </div>
              </div>
            )
          })
      )}
    </div>
  )
}

function MergedTranscriptView({
  agentId,
  group,
}: {
  agentId: string
  group: CallerGroup
}) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderLeft}>
          <div className={styles.detailAvatar}>
            <PhoneIcon width={16} height={16} />
          </div>
          <div>
            <div className={styles.detailCaller}>{group.phoneNumber}</div>
            <div className={styles.detailMeta}>
              {group.conversations.length} session{group.conversations.length !== 1 ? "s" : ""}
              {" · "}
              {group.totalMessages} messages total
            </div>
          </div>
        </div>
      </div>

      <div className={styles.transcript}>
        {group.conversations.map((conv, idx) => (
          <SessionBlock
            key={conv.conversation_id}
            agentId={agentId}
            conv={conv}
            sessionIndex={idx}
          />
        ))}
      </div>
    </div>
  )
}

export function ConversationsTab({ agentId, elevenlabsAgentId }: ConversationsTabProps) {
  const [selected, setSelected] = useState<CallerGroup | null>(null)

  const { data, isLoading, error } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["conversations", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/conversations`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
    enabled: !!elevenlabsAgentId,
  })

  if (!elevenlabsAgentId) {
    return (
      <div className={styles.notConnected}>
        <LockClosedIcon width={32} height={32} className={styles.notConnectedIcon} />
        <div className={styles.notConnectedTitle}>Conversations not available yet</div>
        <div className={styles.notConnectedDesc}>
          Your agent is still being set up. Conversations will appear here once setup is complete.
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <ArrowPathIcon width={20} height={20} className={styles.spin} />
        Loading conversations…
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <ExclamationCircleIcon width={16} height={16} />
        Failed to load conversations.
      </div>
    )
  }

  const groups = groupByPhone(data?.conversations ?? [])

  return (
    <div className={styles.root}>
      <div className={`${styles.pane} ${selected ? styles.paneHidden : ""}`}>
        <div className={styles.paneHeader}>
          <span className={styles.paneTitle}>Conversations</span>
          <span className={styles.paneCount}>{groups.length}</span>
        </div>

        {groups.length === 0 ? (
          <div className={styles.emptyList}>
            <ChatBubbleLeftRightIcon width={28} height={28} className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>No conversations yet</div>
            <div className={styles.emptyDesc}>
              Conversations will appear here once your agent starts talking to customers.
            </div>
          </div>
        ) : (
          <div className={styles.list}>
            {groups.map((group) => (
              <button
                key={group.phoneNumber}
                className={`${styles.listItem} ${selected?.phoneNumber === group.phoneNumber ? styles.listItemActive : ""}`}
                onClick={() => setSelected(group)}
              >
                <div className={styles.listAvatar}>
                  <PhoneIcon width={15} height={15} />
                </div>
                <div className={styles.listContent}>
                  <div className={styles.listTop}>
                    <span className={styles.listCaller}>{group.phoneNumber}</span>
                    <span className={styles.listDate}>{formatDate(group.lastActive)}</span>
                  </div>
                  <div className={styles.listMeta}>
                    <span>{group.conversations.length} session{group.conversations.length !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{group.totalMessages} messages</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`${styles.detailPane} ${!selected ? styles.detailPaneHidden : ""}`}>
        {selected ? (
          <>
            <button className={styles.backBtn} onClick={() => setSelected(null)}>
              ← Back
            </button>
            <MergedTranscriptView agentId={agentId} group={selected} />
          </>
        ) : (
          <div className={styles.noSelection}>
            <ChatBubbleLeftRightIcon width={28} height={28} className={styles.noSelectionIcon} />
            <div>Select a conversation to view the full thread</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConversationsTab
