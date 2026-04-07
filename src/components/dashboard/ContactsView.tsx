"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { formatPhoneNumber } from "@/lib/utils"
import type { TranscriptMessage } from "@/types"
import styles from "./ContactsView.module.css"

interface Contact {
  phoneNumber: string
  conversationCount: number
  lastActive: number
}

interface ConversationSummary {
  conversation_id: string
  start_time_unix_secs: number
  call_duration_secs: number
  transcript_summary: string | null
  status: string
}

interface ContactsViewProps {
  agentId: string
}

function formatTime(unixSecs: number) {
  if (!unixSecs) return "—"
  const date = new Date(unixSecs * 1000)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isThisYear = date.getFullYear() === now.getFullYear()
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (isThisYear) return date.toLocaleDateString([], { month: "short", day: "numeric" })
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function formatDateFull(unixSecs: number) {
  if (!unixSecs) return "Unknown date"
  return new Date(unixSecs * 1000).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(secs: number) {
  if (!secs) return ""
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function ExpandableSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={styles.sessionSummaryWrap}>
      <div
        className={`${styles.sessionSummary} ${expanded ? styles.sessionSummaryExpanded : ""}`}
      >
        {text}
      </div>
      <button
        className={styles.summaryToggle}
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  )
}

function SessionBlock({ agentId, conv }: { agentId: string; conv: ConversationSummary }) {
  const { data: detail, isLoading } = useQuery<{ transcript: TranscriptMessage[] }>({
    queryKey: ["conversation", conv.conversation_id],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/conversations/${conv.conversation_id}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  const messages: TranscriptMessage[] = (detail?.transcript ?? []).filter((msg) => msg.message?.trim())
  const duration = formatDuration(conv.call_duration_secs)

  return (
    <div className={styles.sessionBlock}>
      <div className={styles.sessionDivider}>
        <div className={styles.sessionLine} />
        <div className={styles.sessionLabel}>
          {formatDateFull(conv.start_time_unix_secs)}
          {duration ? ` · ${duration}` : ""}
        </div>
        <div className={styles.sessionLine} />
      </div>

      {conv.transcript_summary && (
        <ExpandableSummary text={conv.transcript_summary} />
      )}

      {isLoading ? (
        <div className={styles.noMessages}>Loading transcript…</div>
      ) : messages.length === 0 ? (
        <div className={styles.noMessages}>No transcript for this session</div>
      ) : (
        <div className={styles.sessionMessages}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`${styles.msg} ${msg.role === "user" ? styles.msgUser : styles.msgAgent}`}
            >
              <div className={styles.bubble}>
                <p className={styles.bubbleText}>{msg.message}</p>
                <span className={styles.bubbleTime}>
                  {Math.floor(msg.time_in_call_secs / 60)}:{String(msg.time_in_call_secs % 60).padStart(2, "0")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContactThread({ agentId, phoneNumber }: { agentId: string; phoneNumber: string }) {
  const { data, isLoading } = useQuery<{ conversations: ConversationSummary[] }>({
    queryKey: ["contact-convs", agentId, phoneNumber],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/conversations?phone=${encodeURIComponent(phoneNumber)}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  const convs = data?.conversations ?? []

  if (isLoading) {
    return (
      <div className={styles.threadLoading}>
        <div className={styles.spinner} />
        <span>Loading conversations…</span>
      </div>
    )
  }

  if (!convs.length) {
    return <div className={styles.noMessages} style={{ padding: "2rem", textAlign: "center" }}>No conversations found</div>
  }

  return (
    <div className={styles.thread}>
      {convs.map((conv) => (
        <SessionBlock key={conv.conversation_id} agentId={agentId} conv={conv} />
      ))}
    </div>
  )
}

export function ContactsView({ agentId }: ContactsViewProps) {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Pagination state
  const [extraContacts, setExtraContacts] = useState<Contact[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Reset pagination on search or agent change
  useEffect(() => {
    setExtraContacts([])
    setNextOffset(null)
    setHasMore(false)
  }, [debouncedSearch, agentId])

  const { data, isLoading } = useQuery<{
    contacts: Contact[]
    total: number
    has_more: boolean
    next_offset: number | null
  }>({
    queryKey: ["contacts", agentId, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await fetch(`/api/agents/${agentId}/contacts?${params}`)
      if (!res.ok) throw new Error("Failed to fetch contacts")
      return res.json()
    },
    enabled: !!agentId,
    staleTime: 30 * 1000,
  })

  // Sync pagination from first page
  useEffect(() => {
    if (data) {
      setHasMore(data.has_more)
      setNextOffset(data.next_offset)
    }
  }, [data])

  const fetchMore = useCallback(async () => {
    if (nextOffset === null || isFetchingMore) return
    setIsFetchingMore(true)
    try {
      const params = new URLSearchParams({ offset: String(nextOffset) })
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await fetch(`/api/agents/${agentId}/contacts?${params}`)
      if (!res.ok) return
      const page = await res.json()
      setExtraContacts((prev) => [...prev, ...page.contacts])
      setHasMore(page.has_more)
      setNextOffset(page.next_offset)
    } finally {
      setIsFetchingMore(false)
    }
  }, [nextOffset, isFetchingMore, agentId, debouncedSearch])

  // Infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) fetchMore()
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isFetchingMore, fetchMore])

  // Deduplicate by phone — background refetches can shift page boundaries,
  // causing the same contact to appear in both page-1 data and extraContacts.
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/contacts/export`)
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "contacts.xlsx"
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fail — user can retry
    } finally {
      setIsExporting(false)
    }
  }, [agentId])

  const allContacts = useMemo(() => {
    const seen = new Set<string>()
    const result: Contact[] = []
    for (const c of [...(data?.contacts ?? []), ...extraContacts]) {
      if (!seen.has(c.phoneNumber)) {
        seen.add(c.phoneNumber)
        result.push(c)
      }
    }
    return result
  }, [data, extraContacts])
  const total = data?.total ?? 0
  const selected = allContacts.find((c) => c.phoneNumber === selectedPhone) ?? null

  return (
    <div className={styles.root}>
      {/* Contact list sidebar */}
      <div className={`${styles.sidebar} ${selected ? styles.sidebarHidden : ""}`}>
        <div className={styles.searchBox}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Total count + export */}
        {!isLoading && total > 0 && (
          <div className={styles.contactsTotal}>
            <span>{total} contact{total !== 1 ? "s" : ""}</span>
            <button
              className={styles.exportBtn}
              onClick={handleExport}
              disabled={isExporting}
              title="Export contacts to Excel"
            >
              {isExporting ? "Exporting…" : "Export"}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className={styles.emptyList}>
            <div className={styles.spinner} />
          </div>
        ) : allContacts.length === 0 ? (
          <div className={styles.emptyList}>
            {search ? "No contacts match your search" : "No contacts yet"}
          </div>
        ) : (
          <div className={styles.contactList}>
            {allContacts.map((contact) => (
              <button
                key={contact.phoneNumber}
                className={`${styles.contactItem} ${selectedPhone === contact.phoneNumber ? styles.contactItemActive : ""}`}
                onClick={() => setSelectedPhone(contact.phoneNumber)}
              >
                <div className={styles.contactAvatar}>
                  {contact.phoneNumber.slice(0, 3)}
                </div>
                <div className={styles.contactInfo}>
                  <div className={styles.contactTop}>
                    <span className={styles.contactName}>
                      {formatPhoneNumber(contact.phoneNumber)}
                    </span>
                    <span className={styles.contactTime}>{formatTime(contact.lastActive)}</span>
                  </div>
                  <div className={styles.contactMeta}>
                    {contact.conversationCount} chat{contact.conversationCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </button>
            ))}
            <div ref={loadMoreRef} style={{ height: 1 }} />
            {isFetchingMore && (
              <div className={styles.loadingMore}>Loading more…</div>
            )}
          </div>
        )}
      </div>

      {/* Thread pane */}
      <div className={`${styles.threadPane} ${!selected ? styles.threadPaneHidden : ""}`}>
        {selected ? (
          <>
            <div className={styles.threadHeader}>
              <button className={styles.backBtn} onClick={() => setSelectedPhone(null)}>
                ← Back
              </button>
              <div className={styles.threadHeaderInfo}>
                <div className={styles.threadName}>{formatPhoneNumber(selected.phoneNumber)}</div>
                <div className={styles.threadMeta}>
                  {selected.conversationCount} chat{selected.conversationCount !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <ContactThread agentId={agentId} phoneNumber={selected.phoneNumber} />
          </>
        ) : (
          <div className={styles.noSelection}>
            <div className={styles.noSelectionIcon}>👤</div>
            <div>Select a contact to view their conversations</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ContactsView
