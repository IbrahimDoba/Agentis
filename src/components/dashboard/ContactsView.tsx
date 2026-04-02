"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { getCallerIdentifier, formatPhoneNumber } from "@/lib/utils"
import type { Conversation, TranscriptMessage } from "@/types"
import styles from "./ContactsView.module.css"

interface Contact {
  phoneNumber: string
  conversations: Conversation[]
  lastActive: number
  totalMessages: number
}

interface ContactsViewProps {
  conversations: Conversation[]
  agentId: string
}

function groupByPhone(conversations: Conversation[]): Contact[] {
  const map = new Map<string, Conversation[]>()

  for (const conv of conversations) {
    const phone = getCallerIdentifier(conv)
    const existing = map.get(phone) ?? []
    map.set(phone, [...existing, conv])
  }

  return Array.from(map.entries())
    .map(([phoneNumber, convs]) => ({
      phoneNumber,
      conversations: [...convs].sort((a, b) => a.start_time_unix_secs - b.start_time_unix_secs),
      lastActive: Math.max(...convs.map((c) => c.start_time_unix_secs)),
      totalMessages: convs.reduce((sum, c) => sum + c.message_count, 0),
    }))
    .sort((a, b) => b.lastActive - a.lastActive)
}

function formatTime(unixSecs: number) {
  const date = new Date(unixSecs * 1000)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isThisYear = date.getFullYear() === now.getFullYear()
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (isThisYear) return date.toLocaleDateString([], { month: "short", day: "numeric" })
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function formatDateFull(unixSecs: number) {
  return new Date(unixSecs * 1000).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(secs: number) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function SessionBlock({ agentId, conv }: { agentId: string; conv: Conversation }) {
  const { data: detail, isLoading } = useQuery<Conversation>({
    queryKey: ["conversation", conv.conversation_id],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/conversations/${conv.conversation_id}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  const messages: TranscriptMessage[] = detail?.transcript ?? []

  return (
    <div>
      <div className={styles.sessionDivider}>
        <div className={styles.sessionLine} />
        <div className={styles.sessionLabel}>
          {formatDateFull(conv.start_time_unix_secs)}
          {conv.call_duration_secs ? ` \u00B7 ${formatDuration(conv.call_duration_secs)}` : ""}
        </div>
        <div className={styles.sessionLine} />
      </div>

      {conv.transcript_summary && (
        <div className={styles.sessionSummary}>{conv.transcript_summary}</div>
      )}

      {isLoading ? (
        <div className={styles.noMessages}>Loading...</div>
      ) : messages.length === 0 ? (
        <div className={styles.noMessages}>No transcript for this session</div>
      ) : (
        messages.map((msg, i) => (
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
        ))
      )}
    </div>
  )
}

function ContactThread({ agentId, contact }: { agentId: string; contact: Contact }) {
  return (
    <div className={styles.thread}>
      {contact.conversations.map((conv) => (
        <SessionBlock key={conv.conversation_id} agentId={agentId} conv={conv} />
      ))}
    </div>
  )
}

export function ContactsView({ conversations, agentId }: ContactsViewProps) {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const contacts = useMemo(() => groupByPhone(conversations), [conversations])

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter((c) => c.phoneNumber.toLowerCase().includes(q))
  }, [contacts, search])

  const selected = contacts.find((c) => c.phoneNumber === selectedPhone) ?? null

  return (
    <div className={styles.root}>
      {/* Contact list */}
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

        {filtered.length === 0 ? (
          <div className={styles.emptyList}>
            {search ? "No contacts match your search" : "No contacts yet"}
          </div>
        ) : (
          <div className={styles.contactList}>
            {filtered.map((contact) => (
              <button
                key={contact.phoneNumber}
                className={`${styles.contactItem} ${selectedPhone === contact.phoneNumber ? styles.contactItemActive : ""}`}
                onClick={() => setSelectedPhone(contact.phoneNumber)}
              >
                <div className={styles.contactAvatar}>
                  {contact.phoneNumber.charAt(0) === "0" ? contact.phoneNumber.slice(1, 4) : contact.phoneNumber.slice(0, 3)}
                </div>
                <div className={styles.contactInfo}>
                  <div className={styles.contactTop}>
                    <span className={styles.contactName}>{contact.phoneNumber}</span>
                    <span className={styles.contactTime}>{formatTime(contact.lastActive)}</span>
                  </div>
                  <div className={styles.contactMeta}>
                    {contact.conversations.length} chat{contact.conversations.length !== 1 ? "s" : ""}
                    {" \u00B7 "}
                    {contact.totalMessages} message{contact.totalMessages !== 1 ? "s" : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thread view */}
      <div className={`${styles.threadPane} ${!selected ? styles.threadPaneHidden : ""}`}>
        {selected ? (
          <>
            <div className={styles.threadHeader}>
              <button className={styles.backBtn} onClick={() => setSelectedPhone(null)}>
                ← Back
              </button>
              <div className={styles.threadHeaderInfo}>
                <div className={styles.threadName}>{selected.phoneNumber}</div>
                <div className={styles.threadMeta}>
                  {selected.conversations.length} chat{selected.conversations.length !== 1 ? "s" : ""}
                  {" \u00B7 "}
                  {selected.totalMessages} messages
                </div>
              </div>
            </div>
            <ContactThread agentId={agentId} contact={selected} />
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
