"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQueries, useQuery } from "@tanstack/react-query"
import { DevicePhoneMobileIcon, PhotoIcon } from "@heroicons/react/24/outline"
import { ContactsTab } from "@/components/dashboard/status/ContactsTab"
import { PostsTab } from "@/components/dashboard/status/PostsTab"
import { AnalyticsTab } from "@/components/dashboard/status/AnalyticsTab"
import styles from "./page.module.css"

interface Agent {
  id: string
  businessName: string
  status: string
}

interface SessionStatus {
  id: string
  agentId: string
  phoneNumber: string | null
  status: "DISCONNECTED" | "QR_PENDING" | "CONNECTING" | "CONNECTED" | "LOGGED_OUT" | "BANNED"
  warmupTier: number
}

async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch("/api/agents")
  if (!res.ok) throw new Error("Failed to fetch agents")
  const data = await res.json()
  return Array.isArray(data) ? data : (data.agents ?? [])
}

async function fetchSession(agentId: string): Promise<SessionStatus | null> {
  const res = await fetch(`/api/baileys/sessions/${agentId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Failed to fetch WhatsApp session")
  return res.json()
}

type Tab = "posts" | "autopilot" | "contacts" | "analytics"
const TABS: Array<{ id: Tab; label: string; ready: boolean }> = [
  { id: "posts", label: "Posts", ready: true },
  { id: "autopilot", label: "Autopilot", ready: false },
  { id: "contacts", label: "Contacts", ready: true },
  { id: "analytics", label: "Analytics", ready: true },
]

const COMING_SOON: Record<Exclude<Tab, "contacts" | "posts" | "analytics">, string> = {
  autopilot: "Keep your status fresh automatically: pick your products and times, and Dailzero posts for you every day.",
}

export default function StatusPage() {
  const [tab, setTab] = useState<Tab>("posts")
  const [manualAgentId, setManualAgentId] = useState<string | null>(null)

  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
  })

  const sessionQueries = useQueries({
    queries: agents.map((agent) => ({
      queryKey: ["baileys-session", "status-page", agent.id],
      queryFn: () => fetchSession(agent.id),
      staleTime: 15_000,
      refetchInterval: 15_000,
    })),
  })

  // Status needs a QR-linked number; Cloud API agents have no session row.
  const eligible = useMemo(
    () =>
      agents
        .map((agent, i) => ({ agent, session: sessionQueries[i]?.data ?? null, isLoading: sessionQueries[i]?.isLoading ?? false }))
        .filter((item) => item.session),
    [agents, sessionQueries]
  )

  const selectedAgentId = useMemo(() => {
    if (manualAgentId && eligible.some((item) => item.agent.id === manualAgentId)) return manualAgentId
    return (eligible.find((item) => item.session?.status === "CONNECTED") ?? eligible[0])?.agent.id ?? null
  }, [manualAgentId, eligible])

  const selected = eligible.find((item) => item.agent.id === selectedAgentId) ?? null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Status</h1>
          <p className={styles.subtitle}>Reach your customers on WhatsApp status, and let the AI answer whoever replies.</p>
        </div>
        <Link href="/dashboard/channels/whatsapp-web" className={styles.linkCard}>
          <DevicePhoneMobileIcon width={16} height={16} />
          Manage Connection
        </Link>
      </div>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {!t.ready && <span className={styles.soon}>Soon</span>}
          </button>
        ))}
      </div>

      <div className={styles.layout}>
        <section className={styles.sidebarCard}>
          <div className={styles.cardTitle}>Choose Agent</div>
          {loadingAgents ? (
            <div className={styles.empty}>Loading agents…</div>
          ) : eligible.length === 0 ? (
            <div className={styles.empty}>
              Status works with WhatsApp numbers linked by QR code. Link one in{" "}
              <Link href="/dashboard/channels/whatsapp-web" className={styles.inlineLink}>
                Channels
              </Link>
              .
            </div>
          ) : (
            <div className={styles.agentList}>
              {eligible.map(({ agent, session, isLoading }) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`${styles.agentRow} ${selectedAgentId === agent.id ? styles.agentRowActive : ""}`}
                  onClick={() => setManualAgentId(agent.id)}
                >
                  <div className={styles.agentAvatar}>{agent.businessName.slice(0, 2).toUpperCase()}</div>
                  <div className={styles.agentInfo}>
                    <div className={styles.agentName}>{agent.businessName}</div>
                    <div className={styles.agentMeta}>
                      {isLoading
                        ? "Checking connection…"
                        : session?.status === "CONNECTED"
                          ? `Connected${session.phoneNumber ? ` · ${session.phoneNumber}` : ""}`
                          : session?.status.replaceAll("_", " ") ?? "No session"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.mainCard}>
          {tab === "autopilot" ? (
            <div className={styles.emptyState}>
              <PhotoIcon width={28} height={28} />
              <div className={styles.soonTitle}>Coming soon</div>
              <div>{COMING_SOON[tab]}</div>
            </div>
          ) : !selected ? (
            <div className={styles.emptyState}>
              <PhotoIcon width={28} height={28} />
              <div>Select an agent with a linked WhatsApp number.</div>
            </div>
          ) : tab === "analytics" ? (
            <AnalyticsTab key={selected.agent.id} agentId={selected.agent.id} />
          ) : tab === "posts" ? (
            <PostsTab key={selected.agent.id} agentId={selected.agent.id} isConnected={selected.session?.status === "CONNECTED"} />
          ) : (
            <ContactsTab key={selected.agent.id} agentId={selected.agent.id} isConnected={selected.session?.status === "CONNECTED"} />
          )}
        </section>
      </div>
    </div>
  )
}
