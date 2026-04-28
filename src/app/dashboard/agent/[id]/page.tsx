"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeftIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
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
  { id: "guide", label: "Guide" },
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

const GUIDE_SECTIONS = [
  {
    title: "Profile",
    icon: "🖼️",
    content: [
      "Upload a profile photo that represents your business — customers may see this in certain WhatsApp flows.",
      "Set your agent's display name, business category, address, and contact details.",
      "The profile is purely informational and does not affect how the AI responds.",
    ],
  },
  {
    title: "Configuration",
    icon: "⚙️",
    content: [
      "This is the most important tab. Write a clear, detailed system prompt that tells the AI who it is and how it should behave.",
      "Include: your business name, what you sell or offer, your tone (friendly, professional, formal), and what the agent should or should not do.",
      "Add your products or services in structured detail — the more specific, the better the agent's answers.",
      "List your FAQs so the agent can handle them instantly without hallucinating.",
      "Set operating hours so the agent knows when to respond and when to tell customers to wait.",
      "Tip: treat the system prompt like a new employee handbook. The agent only knows what you tell it.",
    ],
  },
  {
    title: "Knowledge Base / Documents",
    icon: "📚",
    content: [
      "Upload PDFs, Word docs, or text files with product catalogues, pricing sheets, policies, menus, or any reference material.",
      "The agent uses semantic search to pull relevant context from these documents when answering questions.",
      "For best results, keep documents clean and well-structured. Avoid scanned images or heavily formatted PDFs.",
      "Documents work alongside your configuration — they are searched at query time to supplement the system prompt.",
    ],
  },
  {
    title: "Tools",
    icon: "🔧",
    content: [
      "Tools let your agent take actions beyond just chatting — like checking order status, booking appointments, or fetching data from your systems.",
      "Each tool is a webhook your server exposes. The agent calls it automatically when it decides the tool is relevant.",
      "Define a clear name, description, and parameters for each tool. The agent uses the description to decide when to call it.",
      "Start without tools and add them once your agent is live and you understand what customers ask most.",
    ],
  },
  {
    title: "Templates",
    icon: "✉️",
    content: [
      "Templates are pre-written message shortcuts for your team when taking over a conversation manually.",
      "Create templates for common replies like order confirmations, follow-ups, or appointment reminders.",
      "Templates are only used in human mode — the AI does not use them automatically.",
    ],
  },
  {
    title: "Building a great agent",
    icon: "🚀",
    content: [
      "Step 1 — Write a strong system prompt. Describe your business in 2–3 sentences, then list rules (\"always be polite\", \"never promise discounts without approval\").",
      "Step 2 — Add your products or services with prices, descriptions, and variants. Be exhaustive.",
      "Step 3 — Fill in FAQs with the most common questions your customers ask and the exact answers you want given.",
      "Step 4 — Upload a knowledge base document if you have a detailed catalogue, menu, or policy guide.",
      "Step 5 — Connect to WhatsApp via the Channels page, then test by messaging your WhatsApp number.",
      "Step 6 — Monitor early conversations in the Chats page, refine the system prompt based on where the agent struggles.",
    ],
  },
]

function AgentGuide() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className={styles.guide}>
      <div className={styles.guideHeader}>
        <h2 className={styles.guideTitle}>How to use your agent</h2>
        <p className={styles.guideSub}>Everything you need to know to set up and improve your AI agent.</p>
      </div>
      <div className={styles.guideAccordion}>
        {GUIDE_SECTIONS.map((s) => (
          <div key={s.title} className={styles.guideItem}>
            <button
              className={styles.guideItemBtn}
              onClick={() => setOpen(open === s.title ? null : s.title)}
            >
              <span className={styles.guideItemLeft}>
                <span className={styles.guideItemIcon}>{s.icon}</span>
                <span className={styles.guideItemTitle}>{s.title}</span>
              </span>
              <ChevronDownIcon
                width={16}
                height={16}
                className={styles.guideChevron}
                style={{ transform: open === s.title ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {open === s.title && (
              <ul className={styles.guideItemBody}>
                {s.content.map((line, i) => (
                  <li key={i} className={styles.guideItemLine}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
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
        {activeTab === "guide" && <AgentGuide />}
      </div>
    </div>
  )
}
