"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import styles from "./page.module.css"
import type { AnalystFacts } from "@/lib/analyst/healthReport"
import type { AnalystNarrative } from "@/lib/analyst/narrative"

interface AnalystReport {
  facts: AnalystFacts
  narrative: AnalystNarrative
}

const RISK_BADGE: Record<string, { cls: string; label: string }> = {
  low: { cls: "badgeGreen", label: "Low risk" },
  elevated: { cls: "badgeAmber", label: "Elevated risk" },
  high: { cls: "badgeRed", label: "High risk" },
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
}

export default function AnalystPage() {
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, error } = useQuery<AnalystReport>({
    queryKey: ["analyst-report"],
    queryFn: async () => {
      const res = await fetch("/api/analyst")
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? "Failed to load report")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/analyst?refresh=1")
      if (res.ok) qc.setQueryData(["analyst-report"], await res.json())
    } finally {
      setRefreshing(false)
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>AI Analyst</h1>
            <p className={styles.subtitle}>Reading your account…</p>
          </div>
        </div>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>AI Analyst</h1>
        <div className={styles.summaryCard}>Couldn&apos;t build your report{error instanceof Error ? ` — ${error.message}` : ""}. Try again shortly.</div>
      </div>
    )
  }

  const { facts, narrative } = data
  const risk = RISK_BADGE[facts.banRisk.level] ?? RISK_BADGE.low
  const unlimited = facts.billing.effectiveLimit === -1
  const creditsLine = unlimited
    ? "Unlimited plan"
    : `${facts.billing.usedThisCycle.toLocaleString()} / ${facts.billing.effectiveLimit.toLocaleString()} used`

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>AI Analyst</h1>
          <p className={styles.subtitle}>
            Your account, analysed — generated {new Date(facts.generatedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={refresh} disabled={refreshing}>
          {refreshing ? "Analysing…" : "↻ Re-analyse"}
        </button>
      </div>

      <div className={styles.summaryCard}>{narrative.summary}</div>

      {narrative.actNow.length > 0 && (
        <div className={`${styles.section} ${styles.actNow}`}>
          <h2 className={styles.sectionTitle}>🔴 Act now</h2>
          <ul className={styles.list}>{narrative.actNow.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Ban risk</span>
          <span className={`${styles.badge} ${styles[risk.cls]}`}>{risk.label}</span>
          <span className={styles.cardSub}>
            {facts.banRisk.reasons.length === 0 ? "No risky sending patterns detected." : `${facts.banRisk.reasons.length} flag(s) — details below.`}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>Credits — {facts.plan.label}</span>
          <span className={styles.cardBig}>{creditsLine}</span>
          <span className={styles.cardSub}>
            💳 Wallet: {facts.billing.walletBalance.toLocaleString()} cr
            {facts.billing.projectedRunoutDays !== null ? ` · ~${facts.billing.projectedRunoutDays}d left at current pace` : ""}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardTitle}>This week</span>
          <span className={styles.cardBig}>{facts.week.aiReplies7d.toLocaleString()} AI replies</span>
          <span className={styles.cardSub}>
            {facts.week.inbound7d.toLocaleString()} customer messages · {facts.week.leads7d} leads · {facts.week.aborts7d} double-replies avoided
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>📱 WhatsApp connections</h2>
        {facts.agents.length === 0 && <p className={styles.cardSub}>No agents yet.</p>}
        {facts.agents.map((a) => {
          const badge = a.banned
            ? { cls: "badgeRed", label: "Banned" }
            : a.sessionStatus === "CONNECTED"
              ? { cls: "badgeGreen", label: "Connected" }
              : a.sessionStatus === "none"
                ? { cls: "badgeAmber", label: "Not linked" }
                : { cls: "badgeRed", label: "Disconnected" }
          return (
            <div key={a.agentId} className={styles.agentRow}>
              <div>
                <div className={styles.agentName}>{a.name}</div>
                <div className={styles.agentMeta}>
                  {a.aiReplies7d.toLocaleString()} replies this week
                  {a.warmupTier ? ` · warmup tier ${a.warmupTier}` : ""}
                  {a.disconnects48h > 0 ? ` · ${a.disconnects48h} reconnects in 48h` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className={`${styles.badge} ${styles[badge.cls]}`}>{badge.label}</span>
                {(a.needsRelink || a.sessionStatus === "none") && !a.banned && (
                  <Link href="/dashboard/channels/whatsapp-web" className={styles.linkBtn}>Reconnect →</Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {narrative.needsAttention.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>⚠️ Needs attention</h2>
          <ul className={styles.list}>{narrative.needsAttention.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      {narrative.doingWell.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>✅ Doing well</h2>
          <ul className={styles.list}>{narrative.doingWell.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      <p className={styles.footerNote}>
        Numbers are computed directly from your account activity; the write-up is AI-generated from those numbers.
        Wallet valid until {fmtDate(facts.billing.walletExpiresAt)} · Plan {facts.billing.subscriptionExpired ? "expired" : "renews"} {fmtDate(facts.billing.subscriptionExpiresAt)}.
      </p>
    </div>
  )
}
