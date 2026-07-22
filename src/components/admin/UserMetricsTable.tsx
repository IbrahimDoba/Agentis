"use client"

import { useState } from "react"
import styles from "./UserMetricsTable.module.css"
import { formatDate } from "@/lib/utils"

const PLAN_COLORS: Record<string, string> = {
  free: "var(--text-muted)",
  starter: "var(--accent-dim)",
  pro: "var(--accent)",
  enterprise: "var(--teal)",
}

interface UserMetric {
  id: string
  name: string
  email: string
  status: string
  plan: string
  createdAt: string
  agents: number
  leads: number
  conversations: number
  contacts: number
  credits: number
  // Spendable PAYG wallet balance (0 when empty or expired).
  walletBalance: number
  // True when the plan has lapsed and the wallet is what keeps the AI running.
  payg: boolean
  dzeroAgentCount: number
  dzeroConversations: number
  dzeroContacts: number
}

interface Props {
  users: UserMetric[]
}

type SortKey = keyof UserMetric
type SortDir = "asc" | "desc"

export function UserMetricsTable({ users }: Props) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("conversations")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [dzeroOnly, setDzeroOnly] = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("desc") }
  }

  const filtered = users
    .filter((u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className={styles.sortIcon}>↕</span>
    return <span className={styles.sortIconActive}>{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={dzeroOnly ? styles.filterBtnActive : styles.filterBtn}
          onClick={() => setDzeroOnly((v) => !v)}
        >
          DZero AI
        </button>
        <span className={styles.count}>{filtered.length} users</span>
      </div>

      <div className={styles.wrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>User</th>
              <th className={styles.th} onClick={() => toggleSort("plan")} style={{ cursor: "pointer" }}>
                Plan <SortIcon col="plan" />
              </th>
              <th className={styles.th} onClick={() => toggleSort(dzeroOnly ? "dzeroAgentCount" : "agents")} style={{ cursor: "pointer" }}>
                {dzeroOnly ? "DZero Agents" : "Agents"} <SortIcon col={dzeroOnly ? "dzeroAgentCount" : "agents"} />
              </th>
              <th className={styles.th} onClick={() => toggleSort(dzeroOnly ? "dzeroConversations" : "conversations")} style={{ cursor: "pointer" }}>
                AI Sent <SortIcon col={dzeroOnly ? "dzeroConversations" : "conversations"} />
              </th>
              <th className={styles.th} onClick={() => toggleSort(dzeroOnly ? "dzeroContacts" : "contacts")} style={{ cursor: "pointer" }}>
                {dzeroOnly ? "DZero Contacts" : "Contacts"} <SortIcon col={dzeroOnly ? "dzeroContacts" : "contacts"} />
              </th>
              <th className={styles.th} onClick={() => toggleSort("leads")} style={{ cursor: "pointer" }}>
                Leads <SortIcon col="leads" />
              </th>
              <th className={styles.th} onClick={() => toggleSort("credits")} style={{ cursor: "pointer" }}>
                Credits <SortIcon col="credits" />
              </th>
              <th className={styles.th} onClick={() => toggleSort("walletBalance")} style={{ cursor: "pointer" }}>
                Wallet <SortIcon col="walletBalance" />
              </th>
              <th className={styles.th} onClick={() => toggleSort("createdAt")} style={{ cursor: "pointer" }}>
                Joined <SortIcon col="createdAt" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.userName}>{u.name}</div>
                  <div className={styles.userEmail}>{u.email}</div>
                </td>
                <td className={styles.td}>
                  <span className={styles.planBadge} style={{ color: PLAN_COLORS[u.plan] ?? "var(--text-muted)" }}>
                    {u.plan.charAt(0).toUpperCase() + u.plan.slice(1)}
                  </span>
                  {u.payg && (
                    <span className={styles.planBadge} style={{ color: "#f59e0b", marginLeft: 6 }} title="Plan lapsed — running on pay-as-you-go wallet credits">
                      💳 PAYG
                    </span>
                  )}
                </td>
                <td className={styles.td}><span className={styles.num}>{dzeroOnly ? u.dzeroAgentCount : u.agents}</span></td>
                <td className={styles.td}><span className={styles.num}>{(dzeroOnly ? u.dzeroConversations : u.conversations).toLocaleString()}</span></td>
                <td className={styles.td}><span className={styles.num}>{(dzeroOnly ? u.dzeroContacts : u.contacts).toLocaleString()}</span></td>
                <td className={styles.td}><span className={styles.num}>{u.leads}</span></td>
                <td className={styles.td}>
                  <span className={styles.num}>{u.credits > 0 ? u.credits.toLocaleString() : "—"}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.num} style={u.walletBalance > 0 ? { color: "#f59e0b" } : undefined}>
                    {u.walletBalance > 0 ? u.walletBalance.toLocaleString() : "—"}
                  </span>
                </td>
                <td className={styles.td}>
                  <span className={styles.date}>{formatDate(u.createdAt)}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className={styles.empty}>No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
