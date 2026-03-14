"use client"

import styles from "./ChatList.module.css"
import { formatTime, formatDuration, getCallerIdentifier, cn } from "@/lib/utils"
import type { Conversation } from "@/types"

interface ChatListProps {
  conversations: Conversation[]
  onSelect: (id: string) => void
}

function SuccessBadge({ result }: { result: string }) {
  if (result === "success") return <span className={cn(styles.badge, styles.badgeSuccess)}>✓ Resolved</span>
  if (result === "failure") return <span className={cn(styles.badge, styles.badgeFailure)}>✗ Unresolved</span>
  return null
}

export function ChatList({ conversations, onSelect }: ChatListProps) {
  if (conversations.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>💬</div>
        <div className={styles.emptyTitle}>No conversations yet</div>
        <p className={styles.emptyDesc}>
          When customers chat with your AI agent, conversations will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {conversations.map((conv) => {
        const isActive = conv.status === "in-progress" || conv.status === "initiated"
        const title = conv.call_summary_title || conv.user_id || getCallerIdentifier(conv)
        const subtitle = conv.call_summary_title && conv.user_id ? conv.user_id : null
        const preview = conv.transcript_summary

        return (
          <button
            key={conv.conversation_id}
            className={styles.chatCard}
            onClick={() => onSelect(conv.conversation_id)}
          >
            <div className={styles.chatHeader}>
              <div className={styles.titleGroup}>
                <div className={styles.callerName}>{title}</div>
                {subtitle && <div className={styles.callerSub}>{subtitle}</div>}
              </div>
              <div className={styles.chatTime}>{formatTime(conv.start_time_unix_secs)}</div>
            </div>

            {preview && (
              <p className={styles.previewText}>{preview}</p>
            )}

            <div className={styles.chatMeta}>
              <div className={styles.metaItem}>
                <span className={cn(styles.statusDot, isActive ? styles.active : styles.done)} />
                {isActive ? "In progress" : "Completed"}
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaIcon}>⏱</span>
                {formatDuration(conv.call_duration_secs)}
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaIcon}>💬</span>
                {conv.message_count} {conv.message_count === 1 ? "msg" : "msgs"}
              </div>
              {conv.call_successful && <SuccessBadge result={conv.call_successful} />}
              <div className={cn(styles.metaItem, styles.viewLink)}>View →</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default ChatList
