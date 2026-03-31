"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import styles from "./page.module.css"
import { AgentForm } from "@/components/dashboard/AgentForm"
import { AgentProfileForm } from "@/components/dashboard/AgentProfileForm"
import { KnowledgeBaseTab } from "@/components/dashboard/KnowledgeBaseTab"
import { ToolsTab } from "@/components/dashboard/ToolsTab"
import { StatusBadge } from "@/components/ui/Badge"
import { useAgent } from "@/hooks/useAgent"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "configuration", label: "Configuration" },
  { id: "knowledge-base", label: "Knowledge Base" },
  { id: "tools", label: "Tools" },
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
        <ArrowLeft size={15} /> All Agents
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
        <StatusBadge status={agent.status} />
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map((tab) => (
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
          <KnowledgeBaseTab agentId={agent.id} elevenlabsAgentId={agent.elevenlabsAgentId} />
        )}
        {activeTab === "tools" && (
          <ToolsTab
            agentId={agent.id}
            initialTools={agent.toolsData as any}
            elevenlabsAgentId={agent.elevenlabsAgentId}
          />
        )}
      </div>
    </div>
  )
}
