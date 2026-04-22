"use client"

import Link from "next/link"
import { useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import styles from "./page.module.css"
import { AgentCard } from "@/components/dashboard/AgentCard"
import { ConversationStats } from "@/components/dashboard/ConversationStats"
import { ActivityChart } from "@/components/dashboard/ActivityChart"
import Button from "@/components/ui/Button"
import { formatDate } from "@/lib/utils"
import { useDashboardData } from "@/hooks/useDashboardData"
import { usePlanStats } from "@/hooks/usePlanStats"
import { PLAN_LABELS, PLAN_OVERAGE_RATE_PER_1K, formatNaira } from "@/lib/plans"
import { useRuntimePreference, type RuntimePreference } from "@/hooks/useRuntimePreference"
import type { AgentPublic } from "@/types"

async function fetchAgents(): Promise<AgentPublic[]> {
  const res = await fetch("/api/agents")
  if (!res.ok) throw new Error("Failed to fetch agents")
  const data = await res.json()
  return Array.isArray(data) ? data : (data.agents ?? [])
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

export default function DashboardPage() {
  const { data, isLoading } = useDashboardData()
  const { data: stats } = usePlanStats()
  const { runtime, setRuntime } = useRuntimePreference("orchestrator")
  const { data: agents = [] } = useQuery({
    queryKey: ["agents", "overview"],
    queryFn: fetchAgents,
    staleTime: 60 * 1000,
  })

  const user = data?.user
  const fallbackAgent = data?.agent ?? null
  const firstName = user?.name.split(" ")[0] ?? ""

  const runtimeAgents = useMemo(() => ({
    orchestrator: agents.filter((a) => a.agentRuntime === "orchestrator"),
    elevenlabs: agents.filter((a) => (a.agentRuntime === "elevenlabs") || !!a.elevenlabsAgentId),
  }), [agents])

  const availableRuntimes = useMemo<RuntimePreference[]>(
    () => (["orchestrator", "elevenlabs"] as RuntimePreference[]).filter((rt) => runtimeAgents[rt].length > 0),
    [runtimeAgents]
  )

  const effectiveRuntime = (availableRuntimes.includes(runtime) ? runtime : (availableRuntimes[0] ?? "orchestrator")) as RuntimePreference
  const selectedRuntimeAgent = runtimeAgents[effectiveRuntime][0] ?? fallbackAgent ?? null

  useEffect(() => {
    if (effectiveRuntime !== runtime) setRuntime(effectiveRuntime)
  }, [effectiveRuntime, runtime, setRuntime])

  const plan = stats?.plan ?? "free"
  const planLabel = PLAN_LABELS[plan] ?? plan
  const monthlyUsed = stats?.monthlyCreditsUsed ?? 0
  const creditLimit = stats?.creditLimit ?? 0
  const isUnlimited = creditLimit === -1
  const pct = isUnlimited ? 0 : creditLimit > 0 ? Math.min(100, Math.round((monthlyUsed / creditLimit) * 100)) : 0
  const isDanger = !isUnlimited && pct >= 90
  const isWarning = !isUnlimited && pct >= 75
  const overageRate = PLAN_OVERAGE_RATE_PER_1K[plan] ?? null
  const overageCredits = isUnlimited ? 0 : Math.max(0, monthlyUsed - creditLimit)
  const overageCharge = overageRate !== null && overageCredits > 0
    ? Math.ceil(overageCredits / 1000) * overageRate
    : 0
  const overageActive = overageCredits > 0 && overageRate !== null

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
        {overageActive && (
          <Link href="/dashboard/billing" className={styles.overageBadge}>
            Overage Active · {overageCredits.toLocaleString()} credits · {formatNaira(overageCharge)} due
          </Link>
        )}
        {availableRuntimes.length > 1 && (
          <div style={{
            display: "inline-flex",
            gap: "0.4rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "0.25rem",
            marginTop: "0.9rem",
          }}>
            <button
              onClick={() => setRuntime("orchestrator")}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "0.4rem 0.85rem",
                background: effectiveRuntime === "orchestrator" ? "var(--accent)" : "transparent",
                color: effectiveRuntime === "orchestrator" ? "#000" : "var(--text-muted)",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              DZero AI
            </button>
            <button
              onClick={() => setRuntime("elevenlabs")}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "0.4rem 0.85rem",
                background: effectiveRuntime === "elevenlabs" ? "var(--accent)" : "transparent",
                color: effectiveRuntime === "elevenlabs" ? "#000" : "var(--text-muted)",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ElevenLabs
            </button>
          </div>
        )}
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
            <ConversationStats runtime={effectiveRuntime} agentId={selectedRuntimeAgent?.id} />
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
        ) : selectedRuntimeAgent ? (
          <>
            <AgentCard agent={selectedRuntimeAgent} />
            <ActivityChart agentId={selectedRuntimeAgent.id} />
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
