"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PaperAirplaneIcon, UsersIcon, FireIcon, ArrowTrendingUpIcon } from "@heroicons/react/24/outline"
import styles from "@/app/dashboard/page.module.css"
import type { RuntimePreference } from "@/hooks/useRuntimePreference"

type StatsRange = "7d" | "1m" | "6m" | "1y" | "all"

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "1m", label: "1M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
]

const RANGE_DESCRIPTIONS: Record<StatsRange, string> = {
  "7d": "Last 7 days",
  "1m": "Last 30 days",
  "6m": "Last 6 months",
  "1y": "Last 12 months",
  all: "All time",
}

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
  const [range, setRange] = useState<StatsRange>("all")

  const { data, isLoading } = useQuery<{
    totalConversations: number
    totalAiMessages: number
    totalLeads: number
    totalContacts: number
    totalCreditsUsed: number
    monthlyCreditsUsed: number
    creditLimit: number
    plan: string
    range: StatsRange
  }>({
    queryKey: ["conversation-stats", runtime, agentId ?? "all", range],
    queryFn: async () => {
      const params = new URLSearchParams({ runtime, range })
      if (agentId) params.set("agentId", agentId)
      const res = await fetch(`/api/conversations/stats?${params}`)
      if (!res.ok) throw new Error("Failed to fetch stats")
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  const total = data?.totalConversations ?? 0
  const aiMessages = data?.totalAiMessages ?? 0
  const leads = data?.totalLeads ?? 0
  const contacts = data?.totalContacts ?? 0
  const leadsRate = total > 0 ? Math.round((leads / total) * 100) : 0

  return (
    <section className={styles.statsSection}>
      <div className={styles.statsHeader}>
        <div>
          <div className={styles.statsTitle}>Overview</div>
          <div className={styles.statsSubtitle}>{RANGE_DESCRIPTIONS[range]}</div>
        </div>
        <div className={styles.rangeBar}>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.rangeBtn} ${range === opt.value ? styles.rangeBtnActive : ""}`}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className={styles.statCard}>
              <div className={styles.statCardIcon} style={{ background: "rgba(0, 220, 130, 0.1)", color: "var(--accent)" }}>
                <PaperAirplaneIcon width={18} height={18} />
              </div>
              <div className={styles.statLabel}>AI Messages Sent</div>
              <div className={styles.statValue}>{aiMessages}</div>
              <div className={styles.statSub}>Replies your agent has sent</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statCardIcon} style={{ background: "rgba(99, 179, 237, 0.12)", color: "#63b3ed" }}>
                <UsersIcon width={18} height={18} />
              </div>
              <div className={styles.statLabel}>Contacts</div>
              <div className={styles.statValue}>{contacts}</div>
              <div className={styles.statSub}>Unique callers reached</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statCardIcon} style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" }}>
                <FireIcon width={18} height={18} />
              </div>
              <div className={styles.statLabel}>Leads</div>
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
        )}
      </div>
    </section>
  )
}
