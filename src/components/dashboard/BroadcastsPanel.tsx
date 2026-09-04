"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowPathIcon,
  CheckCircleIcon,
  MegaphoneIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  UsersIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline"
import { Input, Select, Textarea } from "@/components/ui/Input"
import styles from "./BroadcastsPanel.module.css"

interface BroadcastContact {
  phoneNumber: string
  displayName: string | null
  lastActiveAt: string
  sources: string[]
}

interface BroadcastCampaign {
  id: string
  agentId: string
  message: string
  status: "pending" | "running" | "paused" | "completed" | "cancelled" | "failed"
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

interface BroadcastsPanelProps {
  agentId: string
  isConnected: boolean
  warmupTier?: number
}

const MAX_SELECTABLE = 2000
const EMPTY_CONTACTS: BroadcastContact[] = []

function sameSelection(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function formatPhone(phoneNumber: string) {
  if (phoneNumber.length < 7) return phoneNumber
  return `+${phoneNumber}`
}

function sourceLabel(sources: string[]) {
  if (sources.includes("conversation")) return "Recent chat"
  if (sources.includes("customer")) return "Known customer"
  return "History"
}

function statusTone(status: BroadcastCampaign["status"]) {
  if (status === "completed") return styles.statusSuccess
  if (status === "running") return styles.statusRunning
  if (status === "paused") return styles.statusPaused
  if (status === "failed" || status === "cancelled") return styles.statusDanger
  return styles.statusPending
}

// Mirrors SMALL_LIST_MAX_RECIPIENTS in worker/src/queue/broadcast-queue.ts.
const SMALL_LIST_MAX_RECIPIENTS = 10

export function BroadcastsPanel({ agentId, isConnected, warmupTier }: BroadcastsPanelProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState("")
  // Cloud API campaigns: which connected number sends, and which approved
  // template. Free-form text cannot be delivered outside the 24-hour service
  // window, so a template is mandatory there rather than optional.
  const [channel, setChannel] = useState<"whatsapp" | "meta">("whatsapp")
  const [metaNumber, setMetaNumber] = useState<{ phoneNumberId: string; label: string } | null>(null)
  const [templates, setTemplates] = useState<Array<{ name: string; language: string; body: string | null }>>([])
  const [templateName, setTemplateName] = useState("")
  const [selectedPhones, setSelectedPhones] = useState<string[]>([])
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  // Send window: how long to spread the whole broadcast over. A list of
  // SMALL_LIST_MAX_RECIPIENTS or fewer may compress it below 24h, including 0 —
  // "0" means no even-spreading, so sends fall back to the anti-ban gap alone
  // (roughly 8-20s apart). Larger lists keep the 24h floor. Same rule is
  // enforced in the API route and in worker/src/queue/broadcast-queue.ts.
  const [spreadHoursMode, setSpreadHoursMode] = useState<"0" | "24" | "48" | "72" | "custom">("24")
  const [customHours, setCustomHours] = useState(12)
  const isSmallList = selectedPhones.length > 0 && selectedPhones.length <= SMALL_LIST_MAX_RECIPIENTS
  const minHours = isSmallList ? 0 : 24
  const spreadHours = spreadHoursMode === "custom"
    ? Math.max(minHours, Math.min(168, Math.floor(customHours) || minHours))
    : Number(spreadHoursMode)

  // Selecting more contacts can invalidate a sub-24h window that was legal when
  // it was chosen; snap back so the request is not rejected server-side.
  useEffect(() => {
    if (!isSmallList && spreadHoursMode === "0") setSpreadHoursMode("24")
  }, [isSmallList, spreadHoursMode])

  const contactsQuery = useQuery({
    queryKey: ["broadcast-contacts", agentId, search],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/broadcast-contacts?search=${encodeURIComponent(search)}`)
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error ?? "Failed to load contacts")
      }
      return res.json() as Promise<{ contacts: BroadcastContact[]; total: number }>
    },
    enabled: isConnected,
    staleTime: 30_000,
  })

  const broadcastsQuery = useQuery({
    queryKey: ["broadcasts", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/broadcasts`)
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error ?? "Failed to load broadcasts")
      }
      return res.json() as Promise<{ broadcasts: BroadcastCampaign[] }>
    },
    enabled: isConnected,
    refetchInterval: (query) => {
      const campaigns = query.state.data?.broadcasts ?? []
      return campaigns.some((item) => item.status === "running" || item.status === "pending") ? 5000 : false
    },
    staleTime: 15_000,
  })

  const contacts = contactsQuery.data?.contacts ?? EMPTY_CONTACTS
  const broadcasts = broadcastsQuery.data?.broadcasts ?? []

  useEffect(() => {
    setSelectedPhones((current) => {
      const filtered = current.filter((phone) => contacts.some((item) => item.phoneNumber === phone))
      return sameSelection(current, filtered) ? current : filtered
    })
  }, [contacts])

  const selectedSet = useMemo(() => new Set(selectedPhones), [selectedPhones])

  // Only accounts with a connected Cloud API number get the choice at all —
  // for everyone else this is a Baileys-only screen, unchanged.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/meta/connect", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        const first = (data.connections ?? [])[0]
        if (!first || cancelled) return
        setMetaNumber({
          phoneNumberId: first.phoneNumberId,
          label: first.displayPhoneNumber ?? first.phoneNumberId,
        })

        const t = await fetch("/api/meta/templates", { cache: "no-store" })
        if (!t.ok || cancelled) return
        const tdata = await t.json()
        // Only APPROVED templates can actually be sent.
        setTemplates(
          (tdata.templates ?? []).filter((x: { status: string }) => x.status === "APPROVED")
        )
      } catch {
        // Best-effort: a failure here just leaves the screen Baileys-only.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const createBroadcast = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          phoneNumbers: selectedPhones,
          spreadHours,
          channel,
          ...(channel === "meta"
            ? {
                metaPhoneNumberId: metaNumber?.phoneNumberId,
                templateName,
                templateLanguage:
                  templates.find((t) => t.name === templateName)?.language ?? "en_US",
              }
            : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to create broadcast")
      return data as { message?: string }
    },
    onSuccess: (data) => {
      setServerMessage(data.message ?? "Broadcast queued safely.")
      setMessage("")
      setSelectedPhones([])
      queryClient.invalidateQueries({ queryKey: ["broadcasts", agentId] })
    },
  })

  const cancelBroadcast = useMutation({
    mutationFn: async (broadcastId: string) => {
      const res = await fetch(`/api/agents/${agentId}/broadcasts/${broadcastId}/cancel`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel broadcast")
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["broadcasts", agentId] }),
  })

  const resumeBroadcast = useMutation({
    mutationFn: async (broadcastId: string) => {
      const res = await fetch(`/api/agents/${agentId}/broadcasts/${broadcastId}/resume`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to resume broadcast")
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["broadcasts", agentId] }),
  })

  const canSubmit = message.trim().length > 0 && selectedPhones.length > 0 && isConnected

  const togglePhone = (phoneNumber: string) => {
    setServerMessage(null)
    setSelectedPhones((current) => {
      if (current.includes(phoneNumber)) {
        return current.filter((value) => value !== phoneNumber)
      }
      if (current.length >= MAX_SELECTABLE) {
        setServerMessage(`You can select up to ${MAX_SELECTABLE} contacts per broadcast.`)
        return current
      }
      return [...current, phoneNumber]
    })
  }

  const toggleVisibleContacts = () => {
    const visiblePhones = contacts.map((item) => item.phoneNumber)
    const allVisibleSelected = visiblePhones.length > 0 && visiblePhones.every((phone) => selectedSet.has(phone))

    if (allVisibleSelected) {
      setSelectedPhones((current) => current.filter((phone) => !visiblePhones.includes(phone)))
      return
    }

    setSelectedPhones((current) => {
      const next = new Set(current)
      for (const phone of visiblePhones) {
        if (next.size >= MAX_SELECTABLE) break
        next.add(phone)
      }
      if (next.size >= MAX_SELECTABLE && visiblePhones.some((phone) => !current.includes(phone))) {
        setServerMessage(`Selection is capped at ${MAX_SELECTABLE} contacts to keep campaigns controlled.`)
      }
      return Array.from(next)
    })
  }

  if (!isConnected) {
    return (
      <div className={styles.locked}>
        <PauseCircleIcon width={24} height={24} />
        <div>
          <div className={styles.lockedTitle}>Connect WhatsApp before sending broadcasts</div>
          <div className={styles.lockedText}>
            Broadcasts only unlock after the WhatsApp Web session is live, so we can enforce warmup limits and session health checks.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Broadcasts</h2>
          <p className={styles.subtitle}>Send controlled campaigns only to people who have already chatted with this agent.</p>
        </div>
        <div className={styles.pill}>Warmup Tier {warmupTier ?? 1}</div>
      </div>

      <div className={styles.notice}>
        <ExclamationTriangleIcon width={18} height={18} />
        <div>
          Best practice: send only to existing contacts, personalize with <code>{"{name}"}</code>, and keep campaigns small. The worker already randomizes pacing, inserts batch breaks, and auto-pauses after repeated failures.
        </div>
      </div>

      {(serverMessage || createBroadcast.error || contactsQuery.error || broadcastsQuery.error) && (
        <div className={styles.feedback}>
          {serverMessage
            ?? createBroadcast.error?.message
            ?? contactsQuery.error?.message
            ?? broadcastsQuery.error?.message}
        </div>
      )}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Recipients</div>
              <div className={styles.cardSubtitle}>Only known contacts are eligible.</div>
            </div>
            <button type="button" className={styles.linkBtn} onClick={toggleVisibleContacts} disabled={contacts.length === 0}>
              {contacts.length > 0 && contacts.every((item) => selectedSet.has(item.phoneNumber)) ? "Clear visible" : "Select visible"}
            </button>
          </div>

          <Input
            placeholder="Search by name or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className={styles.metaRow}>
            <span><UsersIcon width={14} height={14} /> {selectedPhones.length} selected</span>
            <span>{contactsQuery.isLoading ? "Loading..." : `${contacts.length} contacts shown`}</span>
          </div>

          <div className={styles.contactsList}>
            {contacts.map((contact) => (
              <label key={contact.phoneNumber} className={styles.contactRow}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(contact.phoneNumber)}
                  onChange={() => togglePhone(contact.phoneNumber)}
                />
                <div className={styles.contactBody}>
                  <div className={styles.contactTop}>
                    <span className={styles.contactName}>{contact.displayName ?? formatPhone(contact.phoneNumber)}</span>
                    <span className={styles.contactSource}>{sourceLabel(contact.sources)}</span>
                  </div>
                  <div className={styles.contactMeta}>
                    <span>{formatPhone(contact.phoneNumber)}</span>
                    <span>Last active {new Date(contact.lastActiveAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </div>
                </div>
              </label>
            ))}

            {!contactsQuery.isLoading && contacts.length === 0 && (
              <div className={styles.empty}>
                <UsersIcon width={22} height={22} />
                <div>No eligible contacts yet. Once customers chat with this agent, they’ll appear here for safe broadcast sending.</div>
              </div>
            )}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Compose</div>
              <div className={styles.cardSubtitle}>Keep it relevant and human.</div>
            </div>
          </div>

          {metaNumber && (
            <div className={styles.channelChoice}>
              <label className={styles.channelOption}>
                <input
                  type="radio"
                  checked={channel === "whatsapp"}
                  onChange={() => setChannel("whatsapp")}
                />
                <span>Paired number — free-form message</span>
              </label>
              <label className={styles.channelOption}>
                <input
                  type="radio"
                  checked={channel === "meta"}
                  onChange={() => setChannel("meta")}
                />
                <span>Official ({metaNumber.label}) — approved template</span>
              </label>
            </div>
          )}

          {channel === "meta" ? (
            <div className={styles.templatePick}>
              <label className={styles.templateLabel}>Approved template</label>
              <select
                className={styles.templateSelect}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
              {templates.length === 0 && (
                <p className={styles.templateHint}>
                  No approved templates yet. Create one on the Meta tab — Meta reviews each
                  before it can be sent.
                </p>
              )}
              {templateName && (
                <p className={styles.templatePreview}>
                  {templates.find((t) => t.name === templateName)?.body ?? ""}
                </p>
              )}
              <p className={styles.templateHint}>
                Outside the 24-hour service window only an approved template can be
                delivered, so the message is the template itself.
              </p>
            </div>
          ) : (
          <Textarea
            label="Message"
            placeholder="Hi {name}, we just restocked your most requested item..."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={7}
            maxLength={1000}
            hint="Use {name} to personalize the message and reduce identical-message patterns."
          />
          )}

          <div className={styles.sendWindow}>
            <span className={styles.sendWindowLabel}>Send over</span>
            <div className={styles.sendWindowRow}>
              <Select
                id="bc-window"
                aria-label="Send window"
                className={styles.sendWindowSelect}
                value={spreadHoursMode}
                onChange={(event) => { setServerMessage(null); setSpreadHoursMode(event.target.value as typeof spreadHoursMode) }}
                options={[
                  ...(isSmallList ? [{ value: "0", label: "As soon as possible" }] : []),
                  { value: "24", label: "24 hours" },
                  { value: "48", label: "48 hours" },
                  { value: "72", label: "72 hours" },
                  { value: "custom", label: "Custom…" },
                ]}
              />
              {spreadHoursMode === "custom" && (
                <>
                  <Input
                    type="number"
                    min={minHours}
                    max={168}
                    step={1}
                    value={customHours}
                    onChange={(event) => setCustomHours(Math.max(minHours, Math.min(168, Number(event.target.value) || minHours)))}
                    aria-label="Custom send window in hours"
                    className={styles.sendWindowHours}
                  />
                  <span className={styles.sendWindowUnit}>hours (min {minHours})</span>
                </>
              )}
            </div>
            <p className={styles.sendWindowHint}>
              {spreadHours === 0
                ? "No spreading — messages go out back to back, about 8-20 seconds apart."
                : "Messages are spread evenly across this window so they go out gradually — never all at once."}
              {!isSmallList && selectedPhones.length > SMALL_LIST_MAX_RECIPIENTS
                ? ` Windows under 24 hours need ${SMALL_LIST_MAX_RECIPIENTS} recipients or fewer.`
                : ""}
            </p>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{selectedPhones.length}</div>
              <div className={styles.statLabel}>Recipients</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{message.trim().length}</div>
              <div className={styles.statLabel}>Characters</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{warmupTier ?? 1}</div>
              <div className={styles.statLabel}>Warmup tier</div>
            </div>
          </div>

          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canSubmit || createBroadcast.isPending}
            onClick={() => createBroadcast.mutate()}
          >
            {createBroadcast.isPending
              ? <ArrowPathIcon width={16} height={16} className={styles.spin} />
              : <MegaphoneIcon width={16} height={16} />}
            {createBroadcast.isPending ? "Queueing..." : "Queue Broadcast"}
          </button>
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.cardTitle}>Recent Campaigns</div>
            <div className={styles.cardSubtitle}>Monitor progress and pause if something looks off.</div>
          </div>
        </div>

        <div className={styles.campaignList}>
          {broadcasts.map((broadcast) => {
            const processed = broadcast.sentCount + broadcast.failedCount
            const progress = broadcast.totalCount > 0
              ? Math.min(100, Math.round((processed / broadcast.totalCount) * 100))
              : 0

            return (
              <div key={broadcast.id} className={styles.campaignRow}>
                <div className={styles.campaignTop}>
                  <div>
                    <div className={styles.campaignMessage}>{broadcast.message}</div>
                    <div className={styles.campaignMeta}>
                      Created {new Date(broadcast.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <span className={`${styles.statusBadge} ${statusTone(broadcast.status)}`}>{broadcast.status}</span>
                </div>

                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>

                <div className={styles.campaignBottom}>
                  <div className={styles.campaignStats}>
                    <span><CheckCircleIcon width={14} height={14} /> {broadcast.sentCount} sent</span>
                    <span><ExclamationTriangleIcon width={14} height={14} /> {broadcast.failedCount} failed</span>
                    <span>{broadcast.totalCount} total</span>
                  </div>

                  <div className={styles.actions}>
                    {(broadcast.status === "running" || broadcast.status === "paused") && (
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => resumeBroadcast.mutate(broadcast.id)}
                        disabled={resumeBroadcast.isPending}
                        title="Re-send any recipients that haven't gone out yet"
                      >
                        <PlayCircleIcon width={16} height={16} />
                        Resume
                      </button>
                    )}
                    {(broadcast.status === "running" || broadcast.status === "paused") && (
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() => cancelBroadcast.mutate(broadcast.id)}
                        disabled={cancelBroadcast.isPending}
                      >
                        <PauseCircleIcon width={16} height={16} />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {!broadcastsQuery.isLoading && broadcasts.length === 0 && (
            <div className={styles.empty}>
              <MegaphoneIcon width={22} height={22} />
              <div>No campaigns yet. Your queued broadcasts will show live progress here.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
