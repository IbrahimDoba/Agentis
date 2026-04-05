"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import styles from "@/app/dashboard/page.module.css"

function SkeletonCard() {
  return (
    <div className={styles.statCard} style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
      <div style={{ height: 12, width: 80, background: "var(--border)", borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 28, width: 100, background: "var(--border)", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 12, width: 140, background: "var(--border)", borderRadius: 6 }} />
    </div>
  )
}

export function ConversationStats() {
  const { data, isLoading } = useQuery<{ totalConversations: number; totalLeads: number; totalContacts: number }>({
    queryKey: ["conversation-stats"],
    queryFn: async () => {
      const res = await fetch("/api/conversations/stats")
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
        <div className={styles.statLabel}>Total Conversations</div>
        <div className={styles.statValue}>{total}</div>
        <div className={styles.statSub}>All time calls with your agent</div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statLabel}>Total Contacts</div>
        <div className={styles.statValue}>{contacts}</div>
        <div className={styles.statSub}>Unique callers reached</div>
      </div>

      <Link href="/dashboard/leads" className={styles.statCard} style={{ textDecoration: "none" }}>
        <div className={styles.statLabel}>Total Leads</div>
        <div className={styles.statValue}>{leads}</div>
        <div className={styles.statSub}>View all leads →</div>
      </Link>

      <div className={styles.statCard}>
        <div className={styles.statLabel}>Leads Rate</div>
        <div className={styles.statValue}>{leadsRate}%</div>
        <div className={styles.statSub}>Of conversations become leads</div>
      </div>
    </>
  )
}
