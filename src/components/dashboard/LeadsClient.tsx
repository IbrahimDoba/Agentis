"use client"

import { useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ConversationDrawer } from "./ConversationDrawer"
import styles from "./LeadsClient.module.css"

type LeadStatus = "NEW" | "CONTACTED" | "CLOSED"

interface Lead {
  id: string
  conversationId: string
  agentId: string
  callerNumber: string | null
  summary: string | null
  status: LeadStatus
  notes: string | null
  aiDetected: boolean
  createdAt: string
  agent: { businessName: string; profileImageUrl: string | null }
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  CLOSED: "Closed",
}

const STATUS_NEXT: Record<LeadStatus, LeadStatus | null> = {
  NEW: "CONTACTED",
  CONTACTED: "CLOSED",
  CLOSED: null,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

export function LeadsClient() {
  const queryClient = useQueryClient()
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [filter, setFilter] = useState<LeadStatus | "ALL">("ALL")
  const [openConv, setOpenConv] = useState<{ convId: string; agentId: string } | null>(null)

  const handleOpenConv = useCallback((lead: Lead) => {
    setOpenConv({ convId: lead.conversationId, agentId: lead.agentId })
  }, [])
  const handleCloseConv = useCallback(() => setOpenConv(null), [])

  const { data, isLoading, error } = useQuery<{ leads: Lead[] }>({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads")
      if (!res.ok) throw new Error("Failed to fetch leads")
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  const leads = (data?.leads ?? []).filter((l) => filter === "ALL" || l.status === filter)

  const updateStatus = async (lead: Lead, status: LeadStatus) => {
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    queryClient.setQueryData<{ leads: Lead[] }>(["leads"], (old) => ({
      leads: old?.leads.map((l) => l.id === lead.id ? { ...l, status } : l) ?? [],
    }))
  }

  const removeLead = async (lead: Lead) => {
    await fetch(`/api/leads/${lead.id}`, { method: "DELETE" })
    queryClient.setQueryData<{ leads: Lead[] }>(["leads"], (old) => ({
      leads: old?.leads.filter((l) => l.id !== lead.id) ?? [],
    }))
  }

  const openNotes = (lead: Lead) => {
    setEditingNotes(lead.id)
    setNotesValue(lead.notes ?? "")
  }

  const saveNotes = async (lead: Lead) => {
    setSavingNotes(true)
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notesValue }),
    })
    queryClient.setQueryData<{ leads: Lead[] }>(["leads"], (old) => ({
      leads: old?.leads.map((l) => l.id === lead.id ? { ...l, notes: notesValue } : l) ?? [],
    }))
    setSavingNotes(false)
    setEditingNotes(null)
  }

  if (isLoading) {
    return (
      <div className={styles.loading}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className={styles.skeleton} style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className={styles.error}>Failed to load leads. Please refresh.</div>
  }

  const allLeads = data?.leads ?? []

  return (
    <div>
      {/* Filter tabs */}
      <div className={styles.filters}>
        {(["ALL", "NEW", "CONTACTED", "CLOSED"] as const).map((f) => {
          const count = f === "ALL" ? allLeads.length : allLeads.filter((l) => l.status === f).length
          return (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "ALL" ? "All" : STATUS_LABELS[f]}
              <span className={styles.filterCount}>{count}</span>
            </button>
          )
        })}
      </div>

      {leads.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔥</div>
          <div className={styles.emptyTitle}>
            {filter === "ALL" ? "No leads yet" : `No ${STATUS_LABELS[filter].toLowerCase()} leads`}
          </div>
          <p className={styles.emptyDesc}>
            {filter === "ALL"
              ? "Leads are automatically detected from high-intent conversations, or you can mark them manually from the conversation view."
              : "Change the filter above to see leads in other stages."}
          </p>
        </div>
      )}

      <div className={styles.list}>
        {leads.map((lead) => (
          <div key={lead.id} className={styles.card}>
            <div className={styles.cardTop}>
              <div className={styles.cardLeft}>
                <div className={styles.caller}>
                  {lead.callerNumber ?? "No number"}
                  {lead.aiDetected && (
                    <span className={styles.aiBadge}>✨ AI detected</span>
                  )}
                </div>
                <div className={styles.agentName}>{lead.agent.businessName}</div>
                <div className={styles.date}>{formatDate(lead.createdAt)}</div>
              </div>

              <div className={styles.cardRight}>
                <span className={`${styles.statusBadge} ${styles[`status${lead.status}`]}`}>
                  {STATUS_LABELS[lead.status]}
                </span>
              </div>
            </div>

            {lead.summary && (
              <p className={styles.summary}>{lead.summary}</p>
            )}

            {editingNotes === lead.id ? (
              <div className={styles.notesEdit}>
                <textarea
                  className={styles.notesInput}
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add notes about this lead…"
                  rows={3}
                  autoFocus
                />
                <div className={styles.notesActions}>
                  <button className={styles.saveNotesBtn} onClick={() => saveNotes(lead)} disabled={savingNotes}>
                    {savingNotes ? "Saving…" : "Save"}
                  </button>
                  <button className={styles.cancelNotesBtn} onClick={() => setEditingNotes(null)}>Cancel</button>
                </div>
              </div>
            ) : lead.notes ? (
              <div className={styles.notes} onClick={() => openNotes(lead)}>
                <span className={styles.notesLabel}>Notes</span>
                <p className={styles.notesText}>{lead.notes}</p>
              </div>
            ) : null}

            <div className={styles.cardActions}>
              <button className={styles.viewConvBtn} onClick={() => handleOpenConv(lead)}>
                View Conversation →
              </button>
              {STATUS_NEXT[lead.status] && (
                <button
                  className={styles.progressBtn}
                  onClick={() => updateStatus(lead, STATUS_NEXT[lead.status]!)}
                >
                  Mark as {STATUS_LABELS[STATUS_NEXT[lead.status]!]}
                </button>
              )}
              <button className={styles.notesBtn} onClick={() => openNotes(lead)}>
                {lead.notes ? "Edit Notes" : "Add Notes"}
              </button>
              <button className={styles.removeBtn} onClick={() => removeLead(lead)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConversationDrawer
        conversationId={openConv?.convId ?? null}
        agentId={openConv?.agentId}
        onClose={handleCloseConv}
        isLead
      />
    </div>
  )
}

export default LeadsClient
