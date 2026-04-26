"use client"

import { useState } from "react"
import styles from "./SessionsTable.module.css"
import type { WorkerSessionStatus } from "@/lib/baileys-client"

interface SessionRow {
  agentId: string
  businessName: string
  ownerName: string
  ownerEmail: string
  session: WorkerSessionStatus | null
}

const STATUS_LABEL: Record<string, string> = {
  CONNECTED: "Connected",
  QR_PENDING: "QR Pending",
  CONNECTING: "Connecting",
  DISCONNECTED: "Disconnected",
  LOGGED_OUT: "Logged Out",
  BANNED: "Banned",
}

const STATUS_CLASS: Record<string, string> = {
  CONNECTED: "statusConnected",
  QR_PENDING: "statusPending",
  CONNECTING: "statusPending",
  DISCONNECTED: "statusOff",
  LOGGED_OUT: "statusOff",
  BANNED: "statusBanned",
}

export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  const [actionState, setActionState] = useState<Record<string, "disconnecting" | "restarting" | null>>({})
  const [tierState, setTierState] = useState<Record<string, { value: number; saving: boolean; saved: boolean }>>(() =>
    Object.fromEntries(rows.map((r) => [r.agentId, { value: r.session?.warmupTier ?? 1, saving: false, saved: false }]))
  )

  const handleTierChange = (agentId: string, value: number) => {
    setTierState((s) => ({ ...s, [agentId]: { ...s[agentId], value, saved: false } }))
  }

  const handleTierSave = async (agentId: string) => {
    const tier = tierState[agentId]?.value ?? 1
    setTierState((s) => ({ ...s, [agentId]: { ...s[agentId], saving: true, saved: false } }))
    try {
      const res = await fetch(`/api/baileys/sessions/${agentId}/tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      if (!res.ok) throw new Error("Failed")
      setTierState((s) => ({ ...s, [agentId]: { ...s[agentId], saving: false, saved: true } }))
      setTimeout(() => setTierState((s) => ({ ...s, [agentId]: { ...s[agentId], saved: false } })), 2000)
    } catch {
      setTierState((s) => ({ ...s, [agentId]: { ...s[agentId], saving: false } }))
      alert("Failed to update tier")
    }
  }

  const callAction = async (agentId: string, action: "disconnect" | "restart") => {
    setActionState((s) => ({ ...s, [agentId]: action === "disconnect" ? "disconnecting" : "restarting" }))
    try {
      await fetch(`/api/baileys/sessions/${agentId}/${action}`, { method: "POST" })
      // Reload page to reflect updated status
      window.location.reload()
    } catch {
      setActionState((s) => ({ ...s, [agentId]: null }))
    }
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            <th className={styles.th}>Agent</th>
            <th className={styles.th}>Owner</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Phone</th>
            <th className={styles.th}>Warmup Tier</th>
            <th className={styles.th}>Messages Today</th>
            <th className={styles.th}>Last Connected</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className={styles.empty}>No WhatsApp Web sessions found</td>
            </tr>
          )}
          {rows.map((row) => {
            const s = row.session
            const statusKey = s?.status ?? "DISCONNECTED"
            const stateKey = STATUS_CLASS[statusKey] ?? "statusOff"
            const busy = actionState[row.agentId]
            return (
              <tr key={row.agentId} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.agentName}>{row.businessName}</div>
                  <div className={styles.agentId}>#{row.agentId.slice(0, 8)}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.ownerName}>{row.ownerName}</div>
                  <div className={styles.ownerEmail}>{row.ownerEmail}</div>
                </td>
                <td className={styles.td}>
                  <span className={styles[stateKey]}>
                    {STATUS_LABEL[statusKey] ?? statusKey}
                  </span>
                  {s?.lastDisconnectReason && (
                    <div className={styles.disconnectReason}>{s.lastDisconnectReason}</div>
                  )}
                </td>
                <td className={styles.td}>
                  <span className={styles.mono}>{s?.phoneNumber ?? "—"}</span>
                </td>
                <td className={styles.td}>
                  {s ? (
                    <div className={styles.tierRow}>
                      <select
                        className={styles.tierSelect}
                        value={tierState[row.agentId]?.value ?? s.warmupTier}
                        onChange={(e) => handleTierChange(row.agentId, Number(e.target.value))}
                        disabled={tierState[row.agentId]?.saving}
                      >
                        <option value={1}>Tier 1</option>
                        <option value={2}>Tier 2</option>
                        <option value={3}>Tier 3</option>
                        <option value={4}>Tier 4</option>
                      </select>
                      {(tierState[row.agentId]?.value ?? s.warmupTier) !== s.warmupTier && !tierState[row.agentId]?.saved && (
                        <button
                          className={styles.tierSaveBtn}
                          disabled={tierState[row.agentId]?.saving}
                          onClick={() => handleTierSave(row.agentId)}
                        >
                          {tierState[row.agentId]?.saving ? "…" : "Save"}
                        </button>
                      )}
                      {tierState[row.agentId]?.saved && (
                        <span className={styles.tierSaved}>✓</span>
                      )}
                    </div>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
                <td className={styles.td}>
                  <span className={styles.num}>{s?.dailyMessageCount ?? "—"}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.muted}>
                    {s?.lastConnectedAt
                      ? new Date(s.lastConnectedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </span>
                </td>
                <td className={styles.td}>
                  <div className={styles.actions}>
                    {s?.status === "CONNECTED" || s?.status === "CONNECTING" ? (
                      <button
                        className={styles.btnDanger}
                        disabled={!!busy}
                        onClick={() => callAction(row.agentId, "disconnect")}
                      >
                        {busy === "disconnecting" ? "…" : "Disconnect"}
                      </button>
                    ) : s ? (
                      <button
                        className={styles.btnSecondary}
                        disabled={!!busy}
                        onClick={() => callAction(row.agentId, "restart")}
                      >
                        {busy === "restarting" ? "…" : "Restart"}
                      </button>
                    ) : (
                      <span className={styles.muted}>No session</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
