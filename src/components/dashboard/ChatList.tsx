import styles from "./ChatList.module.css"
import { formatTime } from "@/lib/utils"
import type { Conversation } from "@/types"
import { cn } from "@/lib/utils"

interface ChatListProps {
  conversations: Conversation[]
}

export function ChatList({ conversations }: ChatListProps) {
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
        const durationMins = Math.floor(conv.call_duration_secs / 60)
        const durationSecs = conv.call_duration_secs % 60
        const isActive = conv.status === "in-progress"

        return (
          <div key={conv.conversation_id} className={styles.chatCard}>
            <div className={styles.chatHeader}>
              <div>
                <div className={styles.chatId}>
                  #{conv.conversation_id.slice(0, 12)}...
                </div>
              </div>
              <div className={styles.chatTime}>
                {formatTime(conv.start_time_unix_secs)}
              </div>
            </div>

            <div className={styles.chatMeta}>
              <div className={styles.metaItem}>
                <span
                  className={cn(
                    styles.statusDot,
                    isActive ? styles.active : styles.done
                  )}
                />
                {isActive ? "In progress" : "Completed"}
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaIcon}>⏱</span>
                {durationMins > 0 ? `${durationMins}m ` : ""}
                {durationSecs}s
              </div>
              {conv.transcript && (
                <div className={styles.metaItem}>
                  <span className={styles.metaIcon}>💬</span>
                  {conv.transcript.length} messages
                </div>
              )}
            </div>

            {conv.transcript && conv.transcript.length > 0 && (
              <div className={styles.transcript}>
                {conv.transcript.slice(0, 4).map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      styles.message,
                      msg.role === "user" ? styles.user : styles.agent
                    )}
                  >
                    <div className={styles.bubble}>{msg.message}</div>
                    <div className={styles.msgTime}>
                      {Math.floor(msg.time_in_call_secs / 60)}:
                      {String(msg.time_in_call_secs % 60).padStart(2, "0")}
                    </div>
                  </div>
                ))}
                {conv.transcript.length > 4 && (
                  <div className={styles.metaItem} style={{ padding: "0.25rem 0" }}>
                    +{conv.transcript.length - 4} more messages
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ChatList
