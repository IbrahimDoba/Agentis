"use client"

import Link from "next/link"
import styles from "./page.module.css"
import { AgentCard } from "@/components/dashboard/AgentCard"
import { ConversationStats } from "@/components/dashboard/ConversationStats"
import Button from "@/components/ui/Button"
import { formatDate } from "@/lib/utils"
import { useDashboardData } from "@/hooks/useDashboardData"

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

  const user = data?.user
  const agent = data?.agent ?? null
  const firstName = user?.name.split(" ")[0] ?? ""

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.greeting}>
          Welcome back{firstName ? `, ${firstName}` : ""} 👋
        </h1>
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
          <AgentCard agent={agent} />
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
