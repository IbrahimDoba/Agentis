"use client"

import { useConversations } from "@/hooks/useConversations"
import styles from "@/app/dashboard/page.module.css"

export function ConversationStats() {
  const { data: conversations, isLoading } = useConversations()

  const total = conversations?.length ?? 0
  const completed = conversations?.filter((c) => c.status === "done").length ?? 0
  const resolved = conversations?.filter((c) => c.call_successful === "success").length ?? 0

  if (isLoading) {
    return (
      <div className={styles.statCard} style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
        <div className={styles.statLabel}>Total Conversations</div>
        <div className={styles.statValue} style={{ opacity: 0.3 }}>—</div>
        <div className={styles.statSub}>Loading…</div>
      </div>
    )
  }

  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>Total Conversations</div>
      <div className={styles.statValue}>{total}</div>
      <div className={styles.statSub}>
        {completed} completed · {resolved} resolved
      </div>
    </div>
  )
}
