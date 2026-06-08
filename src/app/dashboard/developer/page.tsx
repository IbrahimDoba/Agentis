"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  CalendarDaysIcon,
  BoltIcon,
  CodeBracketIcon,
  ArrowRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline"
import { useToast } from "@/context/ToastContext"
import styles from "./page.module.css"

type Integration = {
  key: string
  name: string
  description: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  href?: string // set => available; absent => coming soon
}

const INTEGRATIONS: Integration[] = [
  {
    key: "google-calendar",
    name: "Google Calendar",
    description: "Let your agent check availability and book appointments on your calendar.",
    icon: CalendarDaysIcon,
  },
  {
    key: "zapier",
    name: "Zapier",
    description: "Connect your agent to 6,000+ apps and automate workflows — no code.",
    icon: BoltIcon,
  },
  {
    key: "developer",
    name: "Developer API",
    description: "Run and manage your agents from your own apps. Create and manage API keys.",
    icon: CodeBracketIcon,
    href: "/dashboard/api-keys",
  },
]

interface AgentRow {
  id: string
  businessName: string
  status: string
}

export default function DeveloperPage() {
  const { showToast } = useToast()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!active) return
        const arr = Array.isArray(data) ? data : ((data as { agents?: unknown[] })?.agents ?? [])
        const list = (arr as Array<{ id: string; businessName: string; status: string }>).map((a) => ({
          id: a.id,
          businessName: a.businessName,
          status: a.status,
        }))
        setAgents(list)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingAgents(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Only the agents a developer can actually call via the API.
  const activeAgents = agents.filter((a) => a.status === "ACTIVE")

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      showToast("Agent ID copied")
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
    } catch {
      showToast("Couldn't copy — select and copy manually.", "error")
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.subtitle}>
          Connect your agents to the tools you already use, and build on top of them with the API.
        </p>
      </div>

      <div className={styles.grid}>
        {INTEGRATIONS.map((it) => {
          const Icon = it.icon
          const available = !!it.href

          const inner = (
            <>
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>
                  <Icon width={22} height={22} />
                </span>
                {available ? (
                  <ArrowRightIcon width={18} height={18} className={styles.arrow} />
                ) : (
                  <span className={styles.soonBadge}>Coming soon</span>
                )}
              </div>
              <div className={styles.cardName}>{it.name}</div>
              <div className={styles.cardDesc}>{it.description}</div>
            </>
          )

          return available ? (
            <Link key={it.key} href={it.href!} className={styles.card}>
              {inner}
            </Link>
          ) : (
            <button
              key={it.key}
              type="button"
              className={`${styles.card} ${styles.cardSoon}`}
              onClick={() => showToast(`${it.name} integration is coming soon 🚧`)}
            >
              {inner}
            </button>
          )
        })}
      </div>

      {/* Your agents — copyable IDs for the Developer API */}
      <div className={styles.agentsSection}>
        <h2 className={styles.agentsTitle}>Your agents</h2>
        <p className={styles.agentsSub}>
          Use an agent&apos;s ID as the <code className={styles.inlineCode}>agentId</code> in your{" "}
          <Link href="/developers" target="_blank" rel="noopener noreferrer" className={styles.docsLink}>
            API calls
          </Link>
          .
        </p>

        {loadingAgents ? (
          <div className={styles.agentsEmpty}>Loading…</div>
        ) : activeAgents.length === 0 ? (
          <div className={styles.agentsEmpty}>
            No active agents yet. Once an agent is active it&apos;ll show here with its ID.
          </div>
        ) : (
          <div className={styles.agentList}>
            {activeAgents.map((a) => (
              <div key={a.id} className={styles.agentRow}>
                <span className={styles.agentName}>{a.businessName}</span>
                <code className={styles.agentId}>{a.id}</code>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => copyId(a.id)}
                  title="Copy agent ID"
                >
                  {copiedId === a.id ? (
                    <CheckIcon width={15} height={15} />
                  ) : (
                    <ClipboardDocumentIcon width={15} height={15} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
