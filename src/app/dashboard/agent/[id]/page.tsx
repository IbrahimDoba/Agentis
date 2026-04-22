"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import styles from "./page.module.css"
import { AgentForm } from "@/components/dashboard/AgentForm"
import { AgentProfileForm } from "@/components/dashboard/AgentProfileForm"
import { KnowledgeBaseTab } from "@/components/dashboard/KnowledgeBaseTab"
import { ToolsTab } from "@/components/dashboard/ToolsTab"
import { TemplatesTab } from "@/components/dashboard/TemplatesTab"
import { DocumentsTab } from "@/components/dashboard/DocumentsTab"
import { StatusBadge } from "@/components/ui/Badge"
import { TestAgentWidget } from "@/components/dashboard/TestAgentWidget"
import { useAgent } from "@/hooks/useAgent"
import { cn } from "@/lib/utils"

const TABS = (agentRuntime: string) => [
  { id: "profile", label: "Profile" },
  { id: "configuration", label: "Configuration" },
  ...(agentRuntime === "orchestrator"
    ? [{ id: "documents", label: "Documents" }]
    : [{ id: "knowledge-base", label: "Knowledge Base" }]),
  { id: "tools", label: "Tools" },
  { id: "templates", label: "Templates" },
]

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

function AgentAvatar({ src, name, size = 48 }: { src?: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
  if (src) return <Image src={src} alt={name} width={size} height={size} style={{ borderRadius: "50%", objectFit: "cover", width: size, height: size }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "linear-gradient(135deg, var(--accent) 0%, #00a86b 100%)",
      color: "#000", fontWeight: 700, fontSize: size * 0.35,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

export default function AgentDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [activeTab, setActiveTab] = useState("profile")
  const { data, isLoading, error } = useAgent(id)
  const agent = data?.agent ?? null

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Skeleton height={80} />
        <div style={{ marginTop: 24 }}><Skeleton height={48} /></div>
        <div style={{ marginTop: 24 }}><Skeleton height={400} /></div>
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
      {/* Back link */}
      <Link href="/dashboard/agents" className={styles.back}>
        <ArrowLeftIcon width={15} height={15} /> All Agents
      </Link>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <AgentAvatar src={agent.profileImageUrl} name={agent.businessName} size={52} />
          <div>
            <h1 className={styles.title}>{agent.businessName}</h1>
            {agent.category && <p className={styles.category}>{agent.category}</p>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "0.2rem 0.55rem",
            borderRadius: 99,
            background: agent.agentRuntime === "orchestrator" ? "rgba(34, 197, 94, 0.1)" : "rgba(99, 102, 241, 0.1)",
            color: agent.agentRuntime === "orchestrator" ? "var(--accent)" : "#6366f1",
            border: `1px solid ${agent.agentRuntime === "orchestrator" ? "rgba(34, 197, 94, 0.25)" : "rgba(99, 102, 241, 0.25)"}`,
          }}>
            {agent.agentRuntime === "orchestrator" ? "DZero AI" : "ElevenLabs"}
          </span>
          {agent.status === "ACTIVE" && agent.agentRuntime === "elevenlabs" && agent.elevenlabsAgentId && (
            <TestAgentWidget agentId={agent.elevenlabsAgentId} />
          )}
          <StatusBadge status={agent.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS(agent.agentRuntime ?? "orchestrator").map((tab) => (
          <button
            key={tab.id}
            className={cn(styles.tab, activeTab === tab.id ? styles.tabActive : undefined)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        {activeTab === "profile" && (
          <AgentProfileForm agent={agent} />
        )}
        {activeTab === "configuration" && (
          <AgentForm initialData={agent} agentId={agent.id} />
        )}
        {activeTab === "knowledge-base" && (
          <KnowledgeBaseTab agentId={agent.id} elevenlabsAgentId={agent.elevenlabsAgentId} agentRuntime={agent.agentRuntime} />
        )}
        {activeTab === "documents" && (
          <DocumentsTab agentId={agent.id} />
        )}
        {activeTab === "tools" && (
          <ToolsTab
            agentId={agent.id}
            initialTools={agent.toolsData as any}
            elevenlabsAgentId={agent.elevenlabsAgentId}
            agentRuntime={agent.agentRuntime}
            agentStatus={agent.status}
          />
        )}
        {activeTab === "templates" && <TemplatesTab agentId={agent.id} />}
      </div>
    </div>
  )
}
