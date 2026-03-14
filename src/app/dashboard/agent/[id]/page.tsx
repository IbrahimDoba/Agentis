"use client"

import { useParams } from "next/navigation"
import styles from "./page.module.css"
import { AgentForm } from "@/components/dashboard/AgentForm"
import { StatusBadge } from "@/components/ui/Badge"
import { AgentCard } from "@/components/dashboard/AgentCard"
import { useAgent } from "@/hooks/useAgent"

function Skeleton({ height, width }: { height: number; width?: string }) {
  return (
    <div style={{
      height,
      width: width ?? "100%",
      borderRadius: 12,
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  )
}

export default function AgentDetailPage() {
  useParams() // keep for potential future use
  const { data, isLoading, error } = useAgent()
  const agent = data?.agent ?? null

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={32} width="240px" />
            <Skeleton height={16} width="180px" />
          </div>
        </div>
        <div className={styles.statusSection}>
          <Skeleton height={160} />
        </div>
        <div className={styles.formSection}>
          <Skeleton height={400} />
        </div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className={styles.page}>
        <p style={{ color: "var(--danger)", fontSize: 14 }}>
          {error ? "Failed to load agent." : "Agent not found."}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{agent.businessName}</h1>
          <p className={styles.subtitle}>Manage your AI agent configuration</p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className={styles.statusSection}>
        <AgentCard agent={agent} />
      </div>

      <div className={styles.formSection}>
        <h2 className={styles.formTitle}>Edit Agent Details</h2>
        <p className={styles.formSubtitle}>
          Update your agent&apos;s configuration. Changes will be reviewed by our team.
        </p>
        <AgentForm initialData={agent} agentId={agent.id} />
      </div>
    </div>
  )
}
