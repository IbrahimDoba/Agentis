"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import styles from "./AppointmentsClient.module.css"

type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"

interface Appointment {
  id: string
  agentId: string
  conversationId: string | null
  customerName: string | null
  customerNumber: string | null
  title: string
  notes: string | null
  scheduledAt: string
  status: AppointmentStatus
  createdBy: string
  reminder1Minutes: number
  reminder2Minutes: number | null
  createdAt: string
  agent: { businessName: string; profileImageUrl: string | null }
}

interface AgentOption {
  id: string
  businessName: string
  appointmentSchedulingEnabled: boolean
}

interface Props {
  agents: AgentOption[]
  defaultReminder1: number
  defaultReminder2: number | null
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
}

const REMINDER_PRESETS = [
  { minutes: 15, label: "15 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 2880, label: "2 days before" },
  { minutes: 10080, label: "1 week before" },
]

function reminderLabel(minutes: number | null): string {
  if (minutes == null) return "Off"
  return REMINDER_PRESETS.find((p) => p.minutes === minutes)?.label ?? `${minutes} min before`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

// A datetime-local default of "in 1 hour", rounded to 5 min, in the browser tz.
function defaultLocalDateTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AppointmentsClient({ agents, defaultReminder1, defaultReminder2 }: Props) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<"upcoming" | "past" | "all">("upcoming")
  const [newOpen, setNewOpen] = useState(false)

  const { data, isLoading, error } = useQuery<{ appointments: Appointment[] }>({
    queryKey: ["appointments"],
    queryFn: async () => {
      const res = await fetch("/api/appointments")
      if (!res.ok) throw new Error("Failed to fetch appointments")
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["appointments"] })

  const all = useMemo(() => data?.appointments ?? [], [data])
  const now = Date.now()
  const shown = all.filter((a) => {
    const t = new Date(a.scheduledAt).getTime()
    const upcoming = t >= now && a.status === "SCHEDULED"
    if (tab === "upcoming") return upcoming
    if (tab === "past") return !upcoming
    return true
  })

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    refresh()
  }

  const remove = async (id: string) => {
    if (!confirm("Delete this appointment? This can't be undone.")) return
    await fetch(`/api/appointments/${id}`, { method: "DELETE" })
    refresh()
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {(["upcoming", "past", "all"] as const).map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "upcoming" ? "Upcoming" : t === "past" ? "Past" : "All"}
            </button>
          ))}
        </div>
        <button className={styles.newBtn} onClick={() => setNewOpen((v) => !v)}>
          {newOpen ? "Close" : "+ New appointment"}
        </button>
      </div>

      <AiBookingAgents agents={agents} />

      <ReminderDefaults
        defaultReminder1={defaultReminder1}
        defaultReminder2={defaultReminder2}
      />

      {newOpen && (
        <NewAppointmentForm
          agents={agents}
          defaultReminder1={defaultReminder1}
          defaultReminder2={defaultReminder2}
          onCreated={() => { setNewOpen(false); refresh() }}
        />
      )}

      {isLoading && <div className={styles.loading}>{[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}</div>}
      {error && <div className={styles.error}>Failed to load appointments. Please refresh.</div>}

      {!isLoading && !error && shown.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📅</div>
          <div className={styles.emptyTitle}>
            {tab === "upcoming" ? "No upcoming appointments" : "Nothing here yet"}
          </div>
          <p className={styles.emptyDesc}>
            Appointments booked by your AI agent or added manually will show up here, with an email reminder before each one.
          </p>
        </div>
      )}

      <div className={styles.list}>
        {shown.map((a) => {
          const isPast = new Date(a.scheduledAt).getTime() < now
          return (
            <div key={a.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div>
                  <div className={styles.cardTitle}>{a.title}</div>
                  <div className={styles.when}>{formatWhen(a.scheduledAt)}</div>
                </div>
                <span className={`${styles.badge} ${styles[`s_${a.status}`]}`}>{STATUS_LABELS[a.status]}</span>
              </div>

              <div className={styles.meta}>
                {(a.customerName || a.customerNumber) && (
                  <span>👤 {a.customerName ?? a.customerNumber}</span>
                )}
                <span>🤖 {a.agent.businessName}</span>
                <span className={styles.reminderMeta}>
                  🔔 {reminderLabel(a.reminder1Minutes)}{a.reminder2Minutes != null ? ` + ${reminderLabel(a.reminder2Minutes)}` : ""}
                </span>
                <span className={styles.source}>{a.createdBy === "ai" ? "Booked by AI" : "Added manually"}</span>
              </div>

              {a.notes && <p className={styles.notes}>{a.notes}</p>}

              {a.status === "SCHEDULED" && (
                <div className={styles.actions}>
                  {!isPast && (
                    <RescheduleButton appointment={a} onDone={refresh} />
                  )}
                  <button className={styles.actionBtn} onClick={() => patch(a.id, { status: "COMPLETED" })}>Mark done</button>
                  <button className={styles.actionBtn} onClick={() => patch(a.id, { status: "NO_SHOW" })}>No-show</button>
                  <button className={styles.actionBtn} onClick={() => patch(a.id, { status: "CANCELLED" })}>Cancel</button>
                  <button className={styles.removeBtn} onClick={() => remove(a.id)}>Delete</button>
                </div>
              )}
              {a.status !== "SCHEDULED" && (
                <div className={styles.actions}>
                  <button className={styles.removeBtn} onClick={() => remove(a.id)}>Delete</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Account default reminder times ---------------------------------------

function ReminderDefaults({ defaultReminder1, defaultReminder2 }: { defaultReminder1: number; defaultReminder2: number | null }) {
  const [r1, setR1] = useState(defaultReminder1)
  const [r2, setR2] = useState<number | null>(defaultReminder2)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true); setSaved(false)
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentReminder1Minutes: r1, appointmentReminder2Minutes: r2 }),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const dirty = r1 !== defaultReminder1 || r2 !== defaultReminder2

  return (
    <div className={styles.defaults}>
      <div className={styles.defaultsLabel}>
        <strong>Default reminders</strong>
        <span>New appointments use these — you can still change each one.</span>
      </div>
      <div className={styles.defaultsControls}>
        <label>
          1st
          <select value={r1} onChange={(e) => setR1(Number(e.target.value))}>
            {REMINDER_PRESETS.map((p) => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
          </select>
        </label>
        <label>
          2nd
          <select value={r2 ?? "off"} onChange={(e) => setR2(e.target.value === "off" ? null : Number(e.target.value))}>
            <option value="off">Off</option>
            {REMINDER_PRESETS.map((p) => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
          </select>
        </label>
        <button className={styles.saveBtn} onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  )
}

// --- AI auto-booking per agent ---------------------------------------------

function AiBookingAgents({ agents }: { agents: AgentOption[] }) {
  const [flags, setFlags] = useState<Record<string, boolean>>(
    () => Object.fromEntries(agents.map((a) => [a.id, a.appointmentSchedulingEnabled])),
  )
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (agentId: string, next: boolean) => {
    setBusy(agentId)
    setFlags((f) => ({ ...f, [agentId]: next })) // optimistic
    const res = await fetch(`/api/agents/${agentId}/appointment-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    })
    if (!res.ok) setFlags((f) => ({ ...f, [agentId]: !next })) // revert on failure
    setBusy(null)
  }

  if (agents.length === 0) return null

  return (
    <div className={styles.aiBooking}>
      <div className={styles.aiBookingHead}>
        <strong>AI auto-booking</strong>
        <span>Pick which agents can book appointments with customers on their own. Manual booking always works, whatever you choose here.</span>
      </div>
      <div className={styles.agentRows}>
        {agents.map((a) => (
          <div key={a.id} className={styles.agentRow}>
            <span className={styles.agentRowName}>{a.businessName}</span>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={!!flags[a.id]}
                disabled={busy === a.id}
                onChange={(e) => toggle(a.id, e.target.checked)}
              />
              <span className={styles.slider} />
              <span className={styles.switchLabel}>{flags[a.id] ? "On" : "Off"}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- New appointment form --------------------------------------------------

function NewAppointmentForm({ agents, defaultReminder1, defaultReminder2, onCreated }: {
  agents: { id: string; businessName: string }[]
  defaultReminder1: number
  defaultReminder2: number | null
  onCreated: () => void
}) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "")
  const [title, setTitle] = useState("")
  const [when, setWhen] = useState(defaultLocalDateTime())
  const [customerName, setCustomerName] = useState("")
  const [customerNumber, setCustomerNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [r1, setR1] = useState(defaultReminder1)
  const [r2, setR2] = useState<number | null>(defaultReminder2)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setErr(null)
    if (!agentId) { setErr("Pick an agent."); return }
    if (!title.trim()) { setErr("Add a title."); return }
    if (!when) { setErr("Pick a date and time."); return }
    const scheduledAt = new Date(when)
    if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) { setErr("Pick a future date and time."); return }

    setSaving(true)
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        title: title.trim(),
        scheduledAt: scheduledAt.toISOString(),
        customerName: customerName.trim() || null,
        customerNumber: customerNumber.trim() || null,
        notes: notes.trim() || null,
        reminder1Minutes: r1,
        reminder2Minutes: r2,
      }),
    })
    setSaving(false)
    if (!res.ok) { setErr("Couldn't save. Check the fields and try again."); return }
    onCreated()
  }

  return (
    <div className={styles.form}>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Agent</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.businessName}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>What</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Property inspection" maxLength={200} />
        </label>
        <label className={styles.field}>
          <span>When</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Customer name</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" maxLength={200} />
        </label>
        <label className={styles.field}>
          <span>Customer WhatsApp / phone</span>
          <input value={customerNumber} onChange={(e) => setCustomerNumber(e.target.value)} placeholder="Optional" maxLength={40} />
        </label>
        <label className={styles.field}>
          <span>1st reminder</span>
          <select value={r1} onChange={(e) => setR1(Number(e.target.value))}>
            {REMINDER_PRESETS.map((p) => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>2nd reminder</span>
          <select value={r2 ?? "off"} onChange={(e) => setR2(e.target.value === "off" ? null : Number(e.target.value))}>
            <option value="off">Off</option>
            {REMINDER_PRESETS.map((p) => <option key={p.minutes} value={p.minutes}>{p.label}</option>)}
          </select>
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Location, what to bring, product of interest…" maxLength={1000} />
        </label>
      </div>
      {err && <div className={styles.formError}>{err}</div>}
      <div className={styles.formActions}>
        <button className={styles.saveBtn} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save appointment"}</button>
      </div>
    </div>
  )
}

// --- Reschedule (inline datetime edit) ------------------------------------

function RescheduleButton({ appointment, onDone }: { appointment: Appointment; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState("")
  const [saving, setSaving] = useState(false)

  const start = () => {
    const d = new Date(appointment.scheduledAt)
    const pad = (n: number) => String(n).padStart(2, "0")
    setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
    setOpen(true)
  }

  const save = async () => {
    const scheduledAt = new Date(when)
    if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) return
    setSaving(true)
    await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: scheduledAt.toISOString() }),
    })
    setSaving(false); setOpen(false); onDone()
  }

  if (!open) return <button className={styles.actionBtn} onClick={start}>Reschedule</button>
  return (
    <span className={styles.reschedule}>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <button className={styles.actionBtn} onClick={save} disabled={saving}>{saving ? "…" : "Save"}</button>
      <button className={styles.actionBtn} onClick={() => setOpen(false)}>Cancel</button>
    </span>
  )
}

export default AppointmentsClient
