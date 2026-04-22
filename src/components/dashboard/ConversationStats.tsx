"use client"

import { useQuery } from "@tanstack/react-query"
import { ChatBubbleLeftRightIcon, UsersIcon, FireIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline"
import styles from "@/app/dashboard/page.module.css"
import type { RuntimePreference } from "@/hooks/useRuntimePreference"

function SkeletonCard() {
  return (
    <div className={styles.statCard} style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
      <div style={{ height: 12, width: 80, background: "var(--border)", borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 28, width: 100, background: "var(--border)", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 12, width: 140, background: "var(--border)", borderRadius: 6 }} />
    </div>
  )
}


interface ConversationStatsProps {
  runtime: RuntimePreference
  agentId?: string
}

export function ConversationStats({ runtime, agentId }: ConversationStatsProps) {
  const { data, isLoading } = useQuery<{
    totalConversations: number
    totalLeads: number
    totalContacts: number
    totalCreditsUsed: number
    monthlyCreditsUsed: number
    creditLimit: number
    plan: string
  }>({
    queryKey: ["conversation-stats", runtime, agentId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ runtime })
      if (agentId) params.set("agentId", agentId)
      const res = await fetch(`/api/conversations/stats?${params}`)
      if (!res.ok) throw new Error("Failed to fetch stats")
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  if (isLoading) {
    return (
      <>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </>
    )
  }

  const total = data?.totalConversations ?? 0
  const leads = data?.totalLeads ?? 0
  const contacts = data?.totalContacts ?? 0
  const leadsRate = total > 0 ? Math.round((leads / total) * 100) : 0

  return (
    <>
      <div className={styles.statCard}>
        <div className={styles.statCardIcon} style={{ background: "rgba(0, 220, 130, 0.1)", color: "var(--accent)" }}>
          <ChatBubbleLeftRightIcon width={18} height={18} />
        </div>
        <div className={styles.statLabel}>Total Conversations</div>
        <div className={styles.statValue}>{total}</div>
        <div className={styles.statSub}>All time calls with your agent</div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statCardIcon} style={{ background: "rgba(99, 179, 237, 0.12)", color: "#63b3ed" }}>
          <UsersIcon width={18} height={18} />
        </div>
        <div className={styles.statLabel}>Total Contacts</div>
        <div className={styles.statValue}>{contacts}</div>
        <div className={styles.statSub}>Unique callers reached</div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statCardIcon} style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" }}>
          <FireIcon width={18} height={18} />
        </div>
        <div className={styles.statLabel}>Total Leads</div>
        <div className={styles.statValue}>{leads}</div>
        <div className={styles.statSub}>Tracked from conversations</div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statCardIcon} style={{ background: "rgba(167, 139, 250, 0.12)", color: "#a78bfa" }}>
          <ArrowTrendingUpIcon width={18} height={18} />
        </div>
        <div className={styles.statLabel}>Leads Rate</div>
        <div className={styles.statValue}>{leadsRate}%</div>
        <div className={styles.statSub}>Of conversations become leads</div>
      </div>
    </>
  )
}
