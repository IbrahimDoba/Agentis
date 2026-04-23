"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQueries, useQuery } from "@tanstack/react-query"
import { DevicePhoneMobileIcon, MegaphoneIcon } from "@heroicons/react/24/outline"
import { BroadcastsPanel } from "@/components/dashboard/BroadcastsPanel"
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

export default function BroadcastsPage() {
  const [manualAgentId, setManualAgentId] = useState<string | null>(null)

  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
  })

  const sessionQueries = useQueries({
    queries: agents.map((agent) => ({
      queryKey: ["baileys-session", "broadcasts-page", agent.id],
      queryFn: () => fetchSession(agent.id),
      staleTime: 15_000,
      refetchInterval: 5000,
    })),
  })

  const agentSessions = useMemo(
    () =>
      agents.map((agent, index) => ({
        agent,
        session: sessionQueries[index]?.data ?? null,
        isLoading: sessionQueries[index]?.isLoading ?? false,
      })),
    [agents, sessionQueries]
  )

  const eligibleAgentSessions = useMemo(
    () => agentSessions.filter((item) => item.session),
    [agentSessions]
  )

  const preferredAgentId = useMemo(() => {
    const connected = eligibleAgentSessions.find((item) => item.session?.status === "CONNECTED")
    if (connected) return connected.agent.id
    return eligibleAgentSessions[0]?.agent.id ?? agents[0]?.id ?? null
  }, [eligibleAgentSessions, agents])

  const selectedAgentId = useMemo(() => {
    if (manualAgentId && agents.some((agent) => agent.id === manualAgentId)) {
      return manualAgentId
    }
    return preferredAgentId
  }, [manualAgentId, preferredAgentId, agents])

  const { data: session, isLoading: loadingSession } = useQuery({
    queryKey: ["baileys-session", selectedAgentId],
    queryFn: () => fetchSession(selectedAgentId!),
    enabled: !!selectedAgentId,
    refetchInterval: 5000,
  })

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null
  const hasConnectedAgent = agentSessions.some((item) => item.session?.status === "CONNECTED")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Broadcasts</h1>
          <p className={styles.subtitle}>Send carefully paced WhatsApp campaigns to existing contacts only.</p>
        </div>
        <Link href="/dashboard/channels/whatsapp-web" className={styles.linkCard}>
          <DevicePhoneMobileIcon width={16} height={16} />
          Manage Connection
        </Link>
      </div>

      <div className={styles.notice}>
        <MegaphoneIcon width={18} height={18} />
        <div>
          Broadcasts use the WhatsApp Web worker safeguards: recipient verification, warmup caps, randomized delays, batch breaks, and auto-pause on repeated failures.
          {hasConnectedAgent ? " Active WhatsApp connection detected." : " No active WhatsApp connection detected yet."}
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.sidebarCard}>
          <div className={styles.cardTitle}>Choose Agent</div>
          {loadingAgents ? (
            <div className={styles.empty}>Loading agents...</div>
          ) : eligibleAgentSessions.length === 0 ? (
            <div className={styles.empty}>
              No active WhatsApp session found yet. Connect one in{" "}
              <Link href="/dashboard/channels/whatsapp-web" className={styles.inlineLink}>
                Channels
              </Link>
              .
            </div>
          ) : (
            <div className={styles.agentList}>
              {eligibleAgentSessions.map(({ agent, session, isLoading }) => (
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
                        ? "Checking connection..."
                        : session?.status === "CONNECTED"
                          ? `Connected${session.phoneNumber ? ` · ${session.phoneNumber}` : ""}`
                          : session?.status
                            ? session.status.replaceAll("_", " ")
                            : "No session"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.mainCard}>
          {!selectedAgent ? (
            <div className={styles.emptyState}>
              <MegaphoneIcon width={28} height={28} />
              <div>Select a connected agent to open broadcasts.</div>
            </div>
          ) : loadingSession ? (
            <div className={styles.emptyState}>Checking WhatsApp session...</div>
          ) : (
            <BroadcastsPanel
              agentId={selectedAgent.id}
              isConnected={session?.status === "CONNECTED"}
              warmupTier={session?.warmupTier}
            />
          )}
        </section>
      </div>
    </div>
  )
}
