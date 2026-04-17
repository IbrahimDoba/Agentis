"use client"

import Link from "next/link"
import styles from "./page.module.css"
import { AgentCard } from "@/components/dashboard/AgentCard"
import { ConversationStats } from "@/components/dashboard/ConversationStats"
import { ActivityChart } from "@/components/dashboard/ActivityChart"
import Button from "@/components/ui/Button"
import { formatDate } from "@/lib/utils"
import { useDashboardData } from "@/hooks/useDashboardData"
import { usePlanStats } from "@/hooks/usePlanStats"
import { PLAN_LABELS } from "@/lib/plans"

function SkeletonCard() {
  return (
    <div className={styles.statCard} style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
      <div style={{ height: 12, width: 80, background: "var(--border)", borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 28, width: 100, background: "var(--border)", borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 12, width: 140, background: "var(--border)", borderRadius: 6 }} />
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboardData()
  const { data: stats } = usePlanStats()

  const user = data?.user
  const agent = data?.agent ?? null
  const firstName = user?.name.split(" ")[0] ?? ""

  const plan = stats?.plan ?? "free"
  const planLabel = PLAN_LABELS[plan] ?? plan
  const monthlyUsed = stats?.monthlyCreditsUsed ?? 0
  const creditLimit = stats?.creditLimit ?? 0
  const isUnlimited = creditLimit === -1
  const pct = isUnlimited ? 0 : creditLimit > 0 ? Math.min(100, Math.round((monthlyUsed / creditLimit) * 100)) : 0
  const isDanger = !isUnlimited && pct >= 90
  const isWarning = !isUnlimited && pct >= 75

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerTop}>
          <h1 className={styles.greeting}>
            Welcome back{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          {stats && (
            <Link href="/dashboard/profile" className={`${styles.planPill} ${isDanger ? styles.planPillDanger : isWarning ? styles.planPillWarning : ""}`}>
              <span className={styles.planPillLabel}>{planLabel}</span>
              <span className={styles.planPillSep}>·</span>
              <span>⚡ {isUnlimited ? "∞" : `${pct}%`}</span>
            </Link>
          )}
        </div>
        <p className={styles.subtitle}>
          Here&apos;s an overview of your D-Zero AI account — {formatDate(new Date().toISOString())}
        </p>
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
            {agent?.elevenlabsAgentId && <ConversationStats />}
          </>
        )}
      </div>

      <div className={styles.agentSection}>
        <div className={styles.sectionTitle}>Your AI Agent</div>

        {isLoading ? (
          <div className={styles.statCard} style={{
            height: 180,
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        ) : agent ? (
          <>
            <AgentCard agent={agent} />
            {agent.elevenlabsAgentId && <ActivityChart agentId={agent.id} />}
          </>
        ) : (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>🤖</div>
            <div className={styles.emptyTitle}>No agent yet</div>
            <p className={styles.emptyDesc}>
              Create your AI WhatsApp agent in minutes. Just describe your business
              and we&apos;ll handle the rest.
            </p>
            <Link href="/dashboard/agent/create">
              <Button variant="primary">Create Your Agent →</Button>
            </Link>
          </div>
        )}
      </div>

    </div>
  )
}
