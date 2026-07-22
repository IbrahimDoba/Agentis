"use client"

import { useState, useCallback, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import styles from "./page.module.css"
import { AgentForm } from "@/components/dashboard/AgentForm"
import { AgentProfileForm } from "@/components/dashboard/AgentProfileForm"
import { KnowledgeBaseTab } from "@/components/dashboard/KnowledgeBaseTab"
import { ToolsTab } from "@/components/dashboard/ToolsTab"
import { DocumentsTab } from "@/components/dashboard/DocumentsTab"
import { MediaLibraryTab } from "@/components/dashboard/MediaLibraryTab"
import { AgentSettingsTab } from "@/components/dashboard/AgentSettingsTab"
import { EmbedTab } from "@/components/dashboard/EmbedTab"
import { StatusBadge } from "@/components/ui/Badge"
import { TestAgentWidget } from "@/components/dashboard/TestAgentWidget"
import { Modal } from "@/components/ui/Modal"
import Button from "@/components/ui/Button"
import { useAgent } from "@/hooks/useAgent"
import { useBrand } from "@/components/BrandProvider"
import { cn } from "@/lib/utils"

const TABS = (agentRuntime: string) => [
  { id: "profile", label: "Profile" },
  { id: "configuration", label: "Configuration" },
  ...(agentRuntime === "orchestrator"
    ? [{ id: "documents", label: "Documents" }, { id: "media", label: "Media" }]
    : [{ id: "knowledge-base", label: "Knowledge Base" }]),
  { id: "tools", label: "Tools" },
  { id: "embed", label: "Embed" },
  { id: "settings", label: "Settings" },
]

const VALID_TABS = new Set(["profile", "configuration", "documents", "media", "knowledge-base", "tools", "embed", "settings"])

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
  const brand = useBrand()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const initialTabParam = searchParams.get("tab")
  const initialTab = initialTabParam && VALID_TABS.has(initialTabParam) ? initialTabParam : "profile"
  const [activeTab, setActiveTab] = useState(initialTab)
  const [profileDirty, setProfileDirty] = useState(false)
  const [configDirty, setConfigDirty] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [embedDirty, setEmbedDirty] = useState(false)
  const [pendingTab, setPendingTab] = useState<string | null>(null)
  const { data, isLoading, error } = useAgent(id)
  const agent = data?.agent ?? null

  // If the deeplink tab changes (e.g. user navigates back/forward), reflect it.
  useEffect(() => {
    if (initialTabParam && VALID_TABS.has(initialTabParam)) {
      setActiveTab(initialTabParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTabParam])

  const handleProfileDirty = useCallback((d: boolean) => setProfileDirty(d), [])
  const handleConfigDirty = useCallback((d: boolean) => setConfigDirty(d), [])
  const handleSettingsDirty = useCallback((d: boolean) => setSettingsDirty(d), [])
  const handleEmbedDirty = useCallback((d: boolean) => setEmbedDirty(d), [])

  const currentTabIsDirty =
    (activeTab === "profile" && profileDirty) ||
    (activeTab === "configuration" && configDirty) ||
    (activeTab === "settings" && settingsDirty) ||
    (activeTab === "embed" && embedDirty)

  const requestTabChange = (next: string) => {
    if (next === activeTab) return
    if (currentTabIsDirty) {
      setPendingTab(next)
      return
    }
    setActiveTab(next)
  }

  const discardAndSwitch = () => {
    if (!pendingTab) return
    if (activeTab === "profile") setProfileDirty(false)
    if (activeTab === "configuration") setConfigDirty(false)
    if (activeTab === "settings") setSettingsDirty(false)
    if (activeTab === "embed") setEmbedDirty(false)
    setActiveTab(pendingTab)
    setPendingTab(null)
  }

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
            {agent.agentRuntime === "orchestrator" ? brand.appName : "ElevenLabs"}
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
            onClick={() => requestTabChange(tab.id)}
          >
            {tab.label}
            {((tab.id === "profile" && profileDirty) ||
              (tab.id === "configuration" && configDirty) ||
              (tab.id === "settings" && settingsDirty) ||
              (tab.id === "embed" && embedDirty)) && (
              <span className={styles.dirtyDot} aria-label="Unsaved changes" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        {activeTab === "profile" && (
          <AgentProfileForm agent={agent} onDirtyChange={handleProfileDirty} />
        )}
        {activeTab === "configuration" && (
          <AgentForm initialData={agent} agentId={agent.id} onDirtyChange={handleConfigDirty} />
        )}
        {activeTab === "knowledge-base" && (
          <KnowledgeBaseTab agentId={agent.id} elevenlabsAgentId={agent.elevenlabsAgentId} agentRuntime={agent.agentRuntime} />
        )}
        {activeTab === "documents" && (
          <DocumentsTab agentId={agent.id} />
        )}
        {activeTab === "media" && (
          <MediaLibraryTab agentId={agent.id} />
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
        {activeTab === "settings" && (
          <AgentSettingsTab agent={agent} onDirtyChange={handleSettingsDirty} />
        )}
        {activeTab === "embed" && (
          <EmbedTab agentId={agent.id} onDirtyChange={handleEmbedDirty} />
        )}
      </div>

      <Modal
        open={pendingTab !== null}
        onClose={() => setPendingTab(null)}
        title="Unsaved changes"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingTab(null)}>
              Stay on this tab
            </Button>
            <Button variant="danger" onClick={discardAndSwitch}>
              Discard changes
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          You have unsaved changes on the{" "}
          <strong style={{ color: "var(--text-primary)" }}>
            {activeTab === "profile" ? "Profile" : activeTab === "configuration" ? "Configuration" : activeTab === "embed" ? "Embed" : "Settings"}
          </strong>{" "}
          tab. Switching now will lose them. Save first or discard to continue.
        </p>
      </Modal>
    </div>
  )
}
