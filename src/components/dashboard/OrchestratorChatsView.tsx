"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import styles from "./OrchestratorChatsView.module.css"

interface OrchestratorConversation {
  id: string
  phoneNumber: string
  displayPhoneNumber?: string
  phoneSource?: "conversation" | "customer_name_match" | "worker_lid_mapping"
  contactName: string | null
  mode: string
  lastActivityAt: string
  createdAt: string
  messageCount: number
  lastMessage: {
    content: string
    direction: string
    senderRole: string
    createdAt: string
  } | null
}

interface Message {
  id: string
  direction: "inbound" | "outbound"
  senderRole: "ai" | "human"
  content: string
  mediaUrl: string | null
  createdAt: string
}

interface OrchestratorChatsViewProps {
  agentId: string
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function formatFullTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

/** Returns true if the phone number is an unresolved WhatsApp LID (not a real E.164 number) */
function isLid(raw: string): boolean {
  const num = raw.replace(/@.*$/, "").replace(/\D/g, "")
  // Real E.164 numbers are 7–15 digits. LIDs are typically 15 digits but don't
  // match any known country code pattern — use >13 digits as the heuristic.
  return num.length > 13
}

function formatPhone(raw: string) {
  // Strip JID suffix if present (e.g. 1234@s.whatsapp.net → 1234)
  let num = raw.replace(/@.*$/, "").replace(/\D/g, "")

  // WhatsApp multi-device: JIDs can have a device suffix appended.
  // Standard phone lengths: 7-15 digits (ITU-T E.164 max is 15).
  // If >15 digits, trim trailing digits that are likely a device ID.
  if (num.length > 15) num = num.slice(0, 15)

  // Format based on detected country code patterns
  if (num.startsWith("234") && num.length === 13) {
    // Nigeria: +234 XXX XXX XXXX
    return `+234 ${num.slice(3, 6)} ${num.slice(6, 9)} ${num.slice(9)}`
  }
  if ((num.startsWith("1") && num.length === 11)) {
    // US/Canada: +1 (XXX) XXX-XXXX
    return `+1 (${num.slice(1, 4)}) ${num.slice(4, 7)}-${num.slice(7)}`
  }
  if (num.startsWith("44") && num.length === 12) {
    // UK: +44 XXXX XXXXXX
    return `+44 ${num.slice(2, 6)} ${num.slice(6)}`
  }
  if (num.startsWith("91") && num.length === 12) {
    // India: +91 XXXXX XXXXX
    return `+91 ${num.slice(2, 7)} ${num.slice(7)}`
  }
  // Fallback: add + and group digits every 3-4 for readability
  const groups = num.match(/.{1,4}/g) ?? [num]
  return `+${groups.join(" ")}`
}

function displayName(conv: OrchestratorConversation) {
  return conv.contactName?.trim() || "Unknown Contact"
}

function displayPhone(conv: OrchestratorConversation) {
  return conv.displayPhoneNumber ?? conv.phoneNumber
}

export function OrchestratorChatsView({ agentId }: OrchestratorChatsViewProps) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [draftText, setDraftText] = useState("")
  const [leadFilter, setLeadFilter] = useState<"all" | "leads">("all")
  const drawerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data, isLoading } = useQuery<{ conversations: OrchestratorConversation[] }>({
    queryKey: ["orchestrator-chats", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/orchestrator-conversations`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
    enabled: !!agentId,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  })

  const { data: modeData } = useQuery<{ mode: "ai" | "human" }>({
    queryKey: ["orchestrator-mode", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/orchestrator-mode`)
      if (!res.ok) throw new Error("Failed to load mode")
      return res.json()
    },
    enabled: !!agentId,
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000,
  })

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: Message[] }>({
    queryKey: ["orchestrator-messages", selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${selectedId}/messages`)
      if (!res.ok) throw new Error("Failed to load messages")
      return res.json()
    },
    enabled: !!selectedId,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  })

  const { data: leadsData } = useQuery<{ leads: { conversationId: string; agentId: string }[] }>({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads")
      if (!res.ok) return { leads: [] }
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  // SSE: subscribe to live message events while drawer is open
  useEffect(() => {
    if (!selectedId) return
    const es = new EventSource(`/api/conversations/${selectedId}/stream`)
    es.addEventListener("message", () => {
      // Delay refetch slightly — orchestrator saves to DB async via BullMQ
      // so the message won't be in DB the instant the webhook fires
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["orchestrator-messages", selectedId] })
        qc.invalidateQueries({ queryKey: ["orchestrator-chats", agentId] })
      }, 1500)
    })
    es.onerror = () => es.close()
    return () => es.close()
  }, [selectedId, agentId, qc])

  const setMode = useMutation({
    mutationFn: async (mode: "ai" | "human") => {
      const res = await fetch(`/api/agents/${agentId}/orchestrator-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) throw new Error("Failed to update mode")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orchestrator-mode", agentId] })
      qc.invalidateQueries({ queryKey: ["orchestrator-chats", agentId] })
    },
  })

  const sendMessage = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await fetch(`/api/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(err.error ?? "Failed to send")
      }
    },
    onSuccess: () => {
      setDraftText("")
      qc.invalidateQueries({ queryKey: ["orchestrator-messages", selectedId] })
      qc.invalidateQueries({ queryKey: ["orchestrator-chats", agentId] })
    },
  })

  // Close drawer on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // Scroll to bottom when new messages arrive
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCount = useRef(0)
  useEffect(() => {
    const count = messagesData?.messages.length ?? 0
    if (count !== prevMessageCount.current) {
      prevMessageCount.current = count
      messagesEndRef.current?.scrollIntoView({ behavior: count === 1 ? "auto" : "smooth" })
    }
  }, [messagesData])

  const conversations = data?.conversations ?? []
  const leadIds = new Set(
    (leadsData?.leads ?? [])
      .filter((l) => l.agentId === agentId)
      .map((l) => l.conversationId)
  )
  const globalMode = modeData?.mode ?? "ai"
  const searchFiltered = conversations.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.phoneNumber.includes(q) || (c.contactName?.toLowerCase().includes(q) ?? false)
  })
  const filtered = leadFilter === "leads"
    ? searchFiltered.filter((c) => leadIds.has(c.id))
    : searchFiltered
  const selectedConv = conversations.find((c) => c.id === selectedId)

  useEffect(() => {
    if (!agentId || conversations.length === 0) return

    const payload = conversations
      .filter((c) => c.messageCount >= 2)
      .map((c) => ({
        conversationId: c.id,
        callerNumber: displayPhone(c),
        summary: c.lastMessage?.content ?? undefined,
        title: c.contactName ?? undefined,
      }))

    if (payload.length === 0) return

    fetch(`/api/agents/${agentId}/conversations/detect-leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: payload }),
    }).then((r) => {
      if (r.ok) qc.invalidateQueries({ queryKey: ["leads"] })
    })
  }, [agentId, conversations, qc])

  return (
    <div className={styles.root}>
      {/* Search */}
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="Search by name or number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.metaFilters}>
        <button
          className={`${styles.metaFilterBtn} ${leadFilter === "all" ? styles.metaFilterBtnActive : ""}`}
          onClick={() => setLeadFilter("all")}
        >
          All
        </button>
        <button
          className={`${styles.metaFilterBtn} ${leadFilter === "leads" ? styles.metaFilterBtnActive : ""}`}
          onClick={() => setLeadFilter("leads")}
        >
          Leads ({leadIds.size})
        </button>
      </div>

      {/* Conversation list */}
      {isLoading && (
        <div className={styles.skeletons}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={styles.skeleton} style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>💬</div>
          <div className={styles.emptyTitle}>No conversations yet</div>
          <p className={styles.emptyDesc}>Conversations will appear here once customers message your agent.</p>
        </div>
      )}

      <div className={styles.list}>
        {filtered.map((conv) => (
          <button
            key={conv.id}
            className={`${styles.item} ${selectedId === conv.id ? styles.itemActive : ""}`}
            onClick={() => setSelectedId(conv.id)}
          >
            <div className={styles.avatar}>
              {conv.contactName
                ? conv.contactName.trim().slice(0, 2).toUpperCase()
                : conv.phoneNumber.replace(/\D/g, "").slice(-4, -2)}
            </div>
            <div className={styles.itemBody}>
              <div className={styles.itemTop}>
                <span className={styles.phone}>{displayName(conv)}</span>
                <span className={styles.time}>{formatTime(conv.lastActivityAt)}</span>
              </div>
              <div className={styles.phoneSecondary}>
                {isLid(displayPhone(conv))
                  ? `ID: ${displayPhone(conv).replace(/@.*$/, "")}`
                  : formatPhone(displayPhone(conv))}
              </div>
              <div className={styles.preview}>
                {conv.lastMessage
                  ? `${conv.lastMessage.direction === "outbound" ? (conv.lastMessage.senderRole === "human" ? "You: " : "AI: ") : ""}${conv.lastMessage.content.slice(0, 80)}${conv.lastMessage.content.length > 80 ? "…" : ""}`
                  : "No messages yet"}
              </div>
              <div className={styles.meta}>
                <span className={styles.msgCount}>{conv.messageCount} messages</span>
                {leadIds.has(conv.id) && <span className={styles.leadBadge}>Lead</span>}
                <span className={styles.badge}>DZero AI</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Message drawer */}
      {selectedId && (
        <div className={styles.overlay} onClick={() => setSelectedId(null)}>
          <div
            ref={drawerRef}
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className={styles.drawerHeader}>
              <div className={styles.drawerAvatar}>
                {selectedConv
                ? (selectedConv.contactName?.trim().slice(0, 2).toUpperCase() ?? selectedConv.phoneNumber.replace(/\D/g, "").slice(-4, -2))
                : "??"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.drawerPhone}>
                  {selectedConv ? displayName(selectedConv) : ""}
                </div>
                <div className={styles.drawerSub}>
                  {selectedConv
                    ? isLid(displayPhone(selectedConv))
                      ? `ID: ${displayPhone(selectedConv).replace(/@.*$/, "")} · `
                      : `${formatPhone(displayPhone(selectedConv))} · `
                    : ""}
                  {selectedConv?.messageCount} messages
                </div>
              </div>
              {/* AI / Human toggle */}
              {selectedConv && (
                <div className={`${styles.modeToggle} ${setMode.isPending ? styles.modeTogglePending : ""}`}>
                  <button
                    className={`${styles.modeBtn} ${globalMode === "ai" ? styles.modeBtnAi : ""}`}
                    onClick={() => setMode.mutate("ai")}
                    disabled={setMode.isPending}
                    title="AI handles replies for this whole account"
                  >
                    AI
                  </button>
                  <button
                    className={`${styles.modeBtn} ${globalMode === "human" ? styles.modeBtnHuman : ""}`}
                    onClick={() => setMode.mutate("human")}
                    disabled={setMode.isPending}
                    title="You handle replies for this whole account"
                  >
                    Human
                  </button>
                </div>
              )}
              <button className={styles.closeBtn} onClick={() => setSelectedId(null)}>✕</button>
            </div>

            {/* Human mode banner */}
            {globalMode === "human" && (
              <div className={styles.humanBanner}>
                AI paused for this account — you are handling replies manually
              </div>
            )}

            {/* Messages */}
            <div className={styles.messages}>
              {messagesLoading && (
                <div className={styles.loadingMessages}>Loading messages…</div>
              )}
              {!messagesLoading && messagesData?.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.bubble} ${msg.direction === "outbound" ? styles.bubbleOut : styles.bubbleIn}`}
                >
                  {msg.direction === "outbound" && msg.senderRole === "human" && (
                    <div className={styles.bubbleSenderTag}>Human</div>
                  )}
                  <div className={styles.bubbleContent}>{msg.content}</div>
                  <div className={styles.bubbleTime}>{formatFullTime(msg.createdAt)}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input — only in human mode */}
            {globalMode === "human" && (
              <div className={styles.inputWrap}>
                <textarea
                  ref={inputRef}
                  className={styles.messageInput}
                  placeholder="Type a message…"
                  value={draftText}
                  rows={1}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      if (draftText.trim() && selectedId) {
                        sendMessage.mutate({ id: selectedId, text: draftText })
                      }
                    }
                  }}
                />
                <button
                  className={styles.sendBtn}
                  disabled={!draftText.trim() || sendMessage.isPending}
                  onClick={() => {
                    if (draftText.trim() && selectedId) {
                      sendMessage.mutate({ id: selectedId, text: draftText })
                    }
                  }}
                >
                  {sendMessage.isPending ? "…" : "Send"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
