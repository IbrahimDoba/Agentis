"use client"

import Link from "next/link"
import styles from "./page.module.css"
import { useAgents } from "@/hooks/useAgents"
import { useDashboardData } from "@/hooks/useDashboardData"
import { AgentListCard } from "@/components/dashboard/AgentListCard"
import Button from "@/components/ui/Button"
import { LockClosedIcon, PlusIcon } from "@heroicons/react/24/outline"

function Skeleton() {
  return (
    <div style={{
      height: 200,
      borderRadius: 16,
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  )
}

export default function AgentsPage() {
  const { data: agentsData, isLoading: agentsLoading } = useAgents()
  const { data: dashData, isLoading: dashLoading } = useDashboardData()

  const agents = agentsData ?? []
  const maxAgents = dashData?.user?.maxAgents ?? 1
  const isLoading = agentsLoading || dashLoading
  const atLimit = agents.length >= maxAgents

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Agents</h1>
          <p className={styles.subtitle}>
            {agents.length} of {maxAgents} agent{maxAgents !== 1 ? "s" : ""} used
          </p>
        </div>
        <div className={styles.headerRight}>
          {atLimit ? (
            <div className={styles.limitBadge}>
              <LockClosedIcon width={13} height={13} />
              Agent limit reached
            </div>
          ) : (
            <Link href="/dashboard/agent/create">
              <Button variant="primary" size="sm">
                <PlusIcon width={15} height={15} />
                New Agent
              </Button>
            </Link>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className={styles.grid}>
          <Skeleton /><Skeleton /><Skeleton />
        </div>
      ) : agents.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🤖</div>
          <div className={styles.emptyTitle}>No agents yet</div>
          <p className={styles.emptyDesc}>
            Create your first AI WhatsApp agent to start automating customer conversations.
          </p>
          <Link href="/dashboard/agent/create">
            <Button variant="primary">Create Your First Agent →</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {agents.map((agent) => (
              <AgentListCard key={agent.id} agent={agent} />
            ))}
            {atLimit && (
              <div className={styles.lockedCard}>
                <LockClosedIcon width={24} height={24} className={styles.lockIcon} />
                <div className={styles.lockedTitle}>Unlock More Agents</div>
                <p className={styles.lockedDesc}>
                  You&apos;ve reached your agent limit. Contact support to unlock additional agents for your account.
                </p>
                <a href="mailto:support@dailzero.com" className={styles.lockedBtn}>
                  Contact Support
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
