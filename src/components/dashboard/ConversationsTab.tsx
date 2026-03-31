"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { MessageSquare, Phone, Clock, ChevronRight, Lock, Loader2, AlertCircle, User, Bot } from "lucide-react"
import type { Conversation, TranscriptMessage } from "@/types"
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

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (isThisYear) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" })
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function formatDuration(secs: number) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function getCallerNumber(conv: Conversation): string {
  const meta = conv.metadata
  if (!meta) return "Unknown"
  return (
    meta.from_number ||
    meta.caller_id ||
    meta.phone_call?.external_number ||
    meta.phone_call?.from ||
    meta.initiator_identifier ||
    "Unknown"
  )
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "done"
      ? styles.dotDone
      : status === "failed"
      ? styles.dotFailed
      : styles.dotActive
  return <span className={cls} />
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (c: Conversation) => void
}) {
  if (conversations.length === 0) {
    return (
      <div className={styles.emptyList}>
        <MessageSquare size={28} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>No conversations yet</div>
        <div className={styles.emptyDesc}>
          Conversations will appear here once your agent starts talking to customers.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {conversations.map((conv) => {
        const caller = getCallerNumber(conv)
        const isSelected = conv.conversation_id === selectedId
        return (
          <button
            key={conv.conversation_id}
            className={`${styles.listItem} ${isSelected ? styles.listItemActive : ""}`}
            onClick={() => onSelect(conv)}
          >
            <div className={styles.listAvatar}>
              <Phone size={15} />
            </div>
            <div className={styles.listContent}>
              <div className={styles.listTop}>
                <span className={styles.listCaller}>{caller}</span>
                <span className={styles.listDate}>{formatDate(conv.start_time_unix_secs)}</span>
              </div>
              {conv.call_summary_title ? (
                <div className={styles.listSummary}>{conv.call_summary_title}</div>
              ) : (
                <div className={styles.listMeta}>
                  <Clock size={11} />
                  {formatDuration(conv.call_duration_secs)} · {conv.message_count} messages
                </div>
              )}
            </div>
            <div className={styles.listRight}>
              <StatusDot status={conv.status} />
              <ChevronRight size={13} className={styles.listChevron} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function TranscriptView({
  agentId,
  conversation,
}: {
  agentId: string
  conversation: Conversation
}) {
  const { data, isLoading } = useQuery<Conversation>({
    queryKey: ["conversation", conversation.conversation_id],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/conversations/${conversation.conversation_id}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  const caller = getCallerNumber(conversation)

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderLeft}>
          <div className={styles.detailAvatar}>
            <Phone size={16} />
          </div>
          <div>
            <div className={styles.detailCaller}>{caller}</div>
            <div className={styles.detailMeta}>
              {new Date(conversation.start_time_unix_secs * 1000).toLocaleString([], {
                month: "short", day: "numeric", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
              {" · "}
              {formatDuration(conversation.call_duration_secs)}
              {" · "}
              {conversation.message_count} messages
            </div>
          </div>
        </div>
        <StatusDot status={conversation.status} />
      </div>

      {conversation.transcript_summary && (
        <div className={styles.summaryBox}>
          <div className={styles.summaryLabel}>Summary</div>
          <div className={styles.summaryText}>{conversation.transcript_summary}</div>
        </div>
      )}

      <div className={styles.transcript}>
        {isLoading ? (
          <div className={styles.transcriptLoading}>
            <Loader2 size={18} className={styles.spin} />
            Loading transcript…
          </div>
        ) : !data?.transcript || data.transcript.length === 0 ? (
          <div className={styles.transcriptEmpty}>No transcript available.</div>
        ) : (
          data.transcript.map((msg: TranscriptMessage, i: number) => (
            <div
              key={i}
              className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAgent}`}
            >
              <div className={styles.bubbleIcon}>
                {msg.role === "user" ? <User size={12} /> : <Bot size={12} />}
              </div>
              <div className={styles.bubbleBody}>
                <div className={styles.bubbleText}>{msg.message}</div>
                <div className={styles.bubbleTime}>{formatDuration(msg.time_in_call_secs)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export function ConversationsTab({ agentId, elevenlabsAgentId }: ConversationsTabProps) {
  const [selected, setSelected] = useState<Conversation | null>(null)

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
        <Lock size={32} className={styles.notConnectedIcon} />
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
        <Loader2 size={20} className={styles.spin} />
        Loading conversations…
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={16} />
        Failed to load conversations.
      </div>
    )
  }

  const conversations = data?.conversations ?? []

  return (
    <div className={styles.root}>
      <div className={`${styles.pane} ${selected ? styles.paneHidden : ""}`}>
        <div className={styles.paneHeader}>
          <span className={styles.paneTitle}>Conversations</span>
          <span className={styles.paneCount}>{conversations.length}</span>
        </div>
        <ConversationList
          conversations={conversations}
          selectedId={selected?.conversation_id ?? null}
          onSelect={setSelected}
        />
      </div>

      <div className={`${styles.detailPane} ${!selected ? styles.detailPaneHidden : ""}`}>
        {selected ? (
          <>
            <button className={styles.backBtn} onClick={() => setSelected(null)}>
              ← Back
            </button>
            <TranscriptView agentId={agentId} conversation={selected} />
          </>
        ) : (
          <div className={styles.noSelection}>
            <MessageSquare size={28} className={styles.noSelectionIcon} />
            <div>Select a conversation to view the transcript</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ConversationsTab
