"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Cog6ToothIcon, MegaphoneIcon } from "@heroicons/react/24/outline"
import styles from "./OrchestratorChatsView.module.css"
import { useAgentEventStream } from "@/lib/useAgentEventStream"

interface AdContext {
  title: string | null
  body: string | null
  sourceUrl: string | null
  sourceId: string | null
  ctwaClid: string | null
  thumbnailUrl: string | null
  capturedAt: string
}

interface OrchestratorConversation {
  id: string
  phoneNumber: string
  displayPhoneNumber?: string
  phoneSource?: "conversation" | "customer_name_match" | "worker_lid_mapping"
  contactName: string | null
  mode: string
  channel?: "whatsapp" | "embed"
  visitorId?: string | null
  lastActivityAt: string
  createdAt: string
  messageCount: number
  adContext: AdContext | null
  handoffReason?: string | null
  handoffAt?: string | null
  handoffUrgency?: string | null
  leadQualifiedAt?: string | null
  leadIntent?: string | null
  lastMessage: {
    content: string
    direction: string
    senderRole: string
    createdAt: string
  } | null
}

// True when the AI has flagged this conversation for human takeover and the
// operator hasn't yet handled it (i.e. it's still in human mode after the
// handoff was recorded). We treat handoff as "active" until the agent goes
// back to ai mode or the conversation is otherwise resolved.
function needsHumanNow(c: OrchestratorConversation): boolean {
  return !!c.handoffAt && c.mode === "human"
}

function isQualifiedLeadNow(c: OrchestratorConversation): boolean {
  return !!c.leadQualifiedAt
}

function isEmbed(c: OrchestratorConversation): boolean {
  return c.channel === "embed"
}

// Short, stable label for embed visitors who haven't identified themselves.
// Shows the last 6 chars of the visitorId so the operator can at least
// distinguish two anonymous visitors from each other.
function embedLabel(c: OrchestratorConversation): string {
  if (c.contactName) return c.contactName
  const id = c.visitorId || c.phoneNumber
  return "Visitor " + (id.length > 6 ? "…" + id.slice(-6) : id)
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
  if (isEmbed(conv)) return embedLabel(conv)
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
  const [leadFilter, setLeadFilter] = useState<"all" | "leads" | "handoff">("all")
  const drawerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Freshness comes from the SSE stream below (invalidates on push). The
  // interval is just a safety net for a dropped/zombie connection — hence
  // 5 min instead of 30s. refetchIntervalInBackground:false (global default)
  // pauses it while the tab is hidden.
  const SAFETY_NET_MS = 5 * 60 * 1000
  const { data, isLoading } = useQuery<{ conversations: OrchestratorConversation[] }>({
    queryKey: ["orchestrator-chats", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/orchestrator-conversations`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
    enabled: !!agentId,
    staleTime: 30 * 1000,
    refetchInterval: SAFETY_NET_MS,
  })


  // The live window: newest 50 messages, kept fresh by polling. Older history
  // is loaded on demand into `olderMessages` (see below) so the default read
  // stays cheap instead of pulling a whole conversation every 30s.
  const { data: messagesData, isLoading: messagesLoading } = useQuery<{
    messages: Message[]
    hasMore?: boolean
    nextCursor?: string | null
  }>({
    queryKey: ["orchestrator-messages", selectedId],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${selectedId}/messages`)
      if (!res.ok) throw new Error("Failed to load messages")
      return res.json()
    },
    enabled: !!selectedId,
    staleTime: 30 * 1000,
    refetchInterval: SAFETY_NET_MS,
  })

  // Real-time: invalidate the chats list + the open conversation's messages
  // when the agent stream pushes an event. One refetch per actual change,
  // instead of a fixed 30s poll. Falls back to the safety-net interval above
  // if the SSE connection drops.
  useAgentEventStream(
    agentId,
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["orchestrator-chats", agentId] })
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ["orchestrator-messages", selectedId] })
      }
    }, [qc, agentId, selectedId])
  )

  // "Load earlier" pagination — older pages prepended on demand, kept separate
  // from the polled live window so the 30s refetch never re-pulls them.
  const [olderMessages, setOlderMessages] = useState<Message[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  // Reset pagination whenever a different conversation is opened.
  useEffect(() => {
    setOlderMessages([])
    setHasMoreOlder(false)
  }, [selectedId])

  // Seed the "has older" flag from the live window's first load. Only while no
  // older page is loaded yet — otherwise the 30s poll would clobber the flag
  // that loadOlder maintains.
  useEffect(() => {
    if (messagesData && olderMessages.length === 0) {
      setHasMoreOlder(messagesData.hasMore ?? false)
    }
  }, [messagesData, olderMessages.length])

  const loadOlder = useCallback(async () => {
    if (!selectedId || loadingOlder) return
    const earliest = olderMessages[0] ?? messagesData?.messages[0]
    if (!earliest) return
    setLoadingOlder(true)
    try {
      const res = await fetch(
        `/api/conversations/${selectedId}/messages?before=${encodeURIComponent(earliest.id)}`
      )
      if (res.ok) {
        const data: { messages: Message[]; hasMore?: boolean } = await res.json()
        setOlderMessages((prev) => [...data.messages, ...prev])
        setHasMoreOlder(data.hasMore ?? false)
      }
    } finally {
      setLoadingOlder(false)
    }
  }, [selectedId, loadingOlder, olderMessages, messagesData])

  // Full ordered list = loaded older history + the live (polled) window.
  const allMessages = useMemo(
    () => [...olderMessages, ...(messagesData?.messages ?? [])],
    [olderMessages, messagesData]
  )

  const { data: leadsData } = useQuery<{ leads: { conversationId: string; agentId: string }[] }>({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads")
      if (!res.ok) return { leads: [] }
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  // Read receipts for "unread" badging. We compare the conversation's last
  // inbound message timestamp against the user's readAt; if it's newer (or
  // there's no read record at all), the row renders as unread.
  const { data: readsData } = useQuery<{ reads: { conversationId: string; readAt: string }[] }>({
    queryKey: ["conversation-reads"],
    queryFn: async () => {
      const res = await fetch("/api/conversations/read")
      if (!res.ok) return { reads: [] }
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  const markRead = useCallback(
    (conversationId: string) => {
      // Optimistic: bump the local readAt cache immediately so the unread
      // indicator clears without waiting for the network round-trip.
      const nowIso = new Date().toISOString()
      qc.setQueryData<{ reads: { conversationId: string; readAt: string }[] }>(
        ["conversation-reads"],
        (old) => {
          const others = (old?.reads ?? []).filter((r) => r.conversationId !== conversationId)
          return { reads: [...others, { conversationId, readAt: nowIso }] }
        }
      )
      fetch("/api/conversations/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }).catch(() => {})
    },
    [qc]
  )

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
    mutationFn: async ({ conversationId, mode }: { conversationId: string; mode: "ai" | "human" }) => {
      const res = await fetch(`/api/conversations/${conversationId}/mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) throw new Error("Failed to update mode")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orchestrator-chats", agentId] })
    },
  })

  const setAllMode = useMutation({
    mutationFn: async (mode: "ai" | "human") => {
      const res = await fetch(`/api/agents/${agentId}/conversations/mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) throw new Error("Failed to update all conversations")
    },
    onSuccess: () => {
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

  // readMap: conversationId → readAt ISO string. Built from the reads query.
  const readMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of readsData?.reads ?? []) m.set(r.conversationId, r.readAt)
    return m
  }, [readsData])

  // Unread = the latest message is INBOUND (customer-sent) AND arrived after
  // we last marked the conversation read. Outbound (our own/AI replies) don't
  // turn the row unread because we already know about those.
  const isUnread = useCallback(
    (conv: OrchestratorConversation): boolean => {
      const last = conv.lastMessage
      if (!last || last.direction !== "inbound") return false
      const readAt = readMap.get(conv.id)
      if (!readAt) return true
      return new Date(last.createdAt).getTime() > new Date(readAt).getTime()
    },
    [readMap]
  )

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id)
      const conv = conversations.find((c) => c.id === id)
      if (conv && isUnread(conv)) markRead(id)
    },
    [conversations, isUnread, markRead]
  )
  const searchFiltered = conversations.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.phoneNumber.includes(q) || (c.contactName?.toLowerCase().includes(q) ?? false)
  })
  let filtered =
    leadFilter === "leads"
      ? searchFiltered.filter((c) => leadIds.has(c.id) || isQualifiedLeadNow(c))
      : leadFilter === "handoff"
        ? searchFiltered.filter((c) => needsHumanNow(c))
        : searchFiltered

  // Sort: unread by the operator first, then most-recent activity. We sort a
  // shallow copy so we don't mutate the React-Query cache. Needs-human
  // conversations are flagged with a badge (not pinned to the top), so they
  // stay in their natural activity order with everything else.
  filtered = [...filtered].sort((a, b) => {
    const aUnread = isUnread(a) ? 1 : 0
    const bUnread = isUnread(b) ? 1 : 0
    if (aUnread !== bUnread) return bUnread - aUnread
    return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")
  })

  const handoffCount = conversations.filter(needsHumanNow).length
  const selectedConv = conversations.find((c) => c.id === selectedId)
  const convMode = selectedConv?.mode ?? "ai"

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
        {handoffCount > 0 && (
          <button
            className={`${styles.metaFilterBtn} ${leadFilter === "handoff" ? styles.metaFilterBtnActive : ""}`}
            onClick={() => setLeadFilter("handoff")}
          >
            🚨 Needs human ({handoffCount})
          </button>
        )}
      </div>

      {/* Resume all banner — only shown when at least one conversation is in human mode */}
      {conversations.some((c) => c.mode === "human") && (
        <button
          className={styles.resumeAllBanner}
          disabled={setAllMode.isPending}
          onClick={() => setAllMode.mutate("ai")}
        >
          <span>⚠ {conversations.filter((c) => c.mode === "human").length} conversation{conversations.filter((c) => c.mode === "human").length !== 1 ? "s" : ""} paused</span>
          <span className={styles.resumeAllAction}>
            {setAllMode.isPending ? "Resuming…" : "Resume all AI →"}
          </span>
        </button>
      )}

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
        {filtered.map((conv) => {
          const unread = isUnread(conv)
          const isLead = leadIds.has(conv.id) || isQualifiedLeadNow(conv)
          const needsHuman = needsHumanNow(conv)
          return (
            <button
              key={conv.id}
              className={`${styles.item} ${selectedId === conv.id ? styles.itemActive : ""} ${unread ? styles.itemUnread : ""}`}
              onClick={() => handleSelect(conv.id)}
            >
              <div className={styles.avatar}>
                {conv.contactName
                  ? conv.contactName.trim().slice(0, 2).toUpperCase()
                  : conv.phoneNumber.replace(/\D/g, "").slice(-4, -2)}
              </div>
              <div className={styles.itemBody}>
                <div className={styles.itemTop}>
                  <span className={`${styles.phone} ${unread ? styles.phoneUnread : ""}`}>
                    {unread && <span className={styles.unreadDot} aria-label="Unread" />}
                    {displayName(conv)}
                  </span>
                  <span className={styles.itemTopRight}>
                    {needsHuman && (
                      <span
                        className={styles.handoffBadge}
                        title={conv.handoffReason ? `Needs human: ${conv.handoffReason}` : "Needs human"}
                      >
                        🚨 Needs human
                      </span>
                    )}
                    {isLead && <span className={styles.leadBadge} title={conv.leadIntent ?? "Lead"}>🔥 Lead</span>}
                    <span className={`${styles.time} ${unread ? styles.timeUnread : ""}`}>
                      {formatTime(conv.lastActivityAt)}
                    </span>
                  </span>
                </div>
                <div className={styles.phoneSecondary}>
                  {isEmbed(conv)
                    ? <><span className={styles.channelTag}>🌐 Web</span> {conv.contactName ? embedLabel(conv) : ""}</>
                    : isLid(displayPhone(conv))
                      ? `ID: ${displayPhone(conv).replace(/@.*$/, "")}`
                      : formatPhone(displayPhone(conv))}
                </div>
                <div className={`${styles.preview} ${unread ? styles.previewUnread : ""}`}>
                  {conv.lastMessage
                    ? `${conv.lastMessage.direction === "outbound" ? (conv.lastMessage.senderRole === "human" ? "You: " : "AI: ") : ""}${conv.lastMessage.content.slice(0, 80)}${conv.lastMessage.content.length > 80 ? "…" : ""}`
                    : "No messages yet"}
                </div>
                <div className={styles.meta}>
                  <span className={styles.msgCount}>{conv.messageCount} messages</span>
                  {conv.mode === "human" && <span className={styles.humanBadge}>Human</span>}
                  <span className={styles.badge}>DZero AI</span>
                </div>
              </div>
            </button>
          )
        })}
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
                  {selectedConv && isEmbed(selectedConv)
                    ? <><span className={styles.channelTag}>🌐 Web</span>{" · "}</>
                    : selectedConv
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
                    className={`${styles.modeBtn} ${convMode === "ai" ? styles.modeBtnAi : ""}`}
                    onClick={() => setMode.mutate({ conversationId: selectedId!, mode: "ai" })}
                    disabled={setMode.isPending}
                    title="AI handles replies for this conversation"
                  >
                    AI
                  </button>
                  <button
                    className={`${styles.modeBtn} ${convMode === "human" ? styles.modeBtnHuman : ""}`}
                    onClick={() => setMode.mutate({ conversationId: selectedId!, mode: "human" })}
                    disabled={setMode.isPending}
                    title="You handle replies for this conversation"
                  >
                    Human
                  </button>
                </div>
              )}
              {/* Settings deeplink — opens the agent's Settings tab in a new tab so
                  the operator doesn't lose their place in the chat. */}
              <Link
                href={`/dashboard/agent/${agentId}?tab=settings`}
                className={styles.settingsBtn}
                title="Conversation settings for this agent"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Cog6ToothIcon width={16} height={16} />
              </Link>
              <button className={styles.closeBtn} onClick={() => setSelectedId(null)}>✕</button>
            </div>

            {/* Human mode banner */}
            {convMode === "human" && (
              <div className={styles.humanBanner}>
                AI paused for this conversation — you are handling replies manually
              </div>
            )}

            {/* AI-initiated handoff — the AI called request_human_handoff and
                surfaced a reason. Show prominently above the message stream so
                the operator triages with the AI's own justification in view. */}
            {selectedConv?.handoffAt && selectedConv.handoffReason && (
              <div
                className={`${styles.handoffBanner} ${selectedConv.handoffUrgency === "high" ? styles.handoffBannerHigh : ""}`}
              >
                <span className={styles.handoffBannerIcon}>🚨</span>
                <div className={styles.handoffBannerBody}>
                  <div className={styles.handoffBannerTitle}>
                    AI requested human takeover
                    {selectedConv.handoffUrgency === "high" && <span className={styles.urgencyChip}>HIGH</span>}
                  </div>
                  <div className={styles.handoffBannerReason}>{selectedConv.handoffReason}</div>
                  <div className={styles.handoffBannerMeta}>
                    Flagged {formatFullTime(selectedConv.handoffAt)}
                  </div>
                </div>
              </div>
            )}

            {/* AI-qualified lead banner — separate from the handoff banner so
                both can appear if both fired. Lead intent is the AI's stated
                summary of what the customer wants. */}
            {selectedConv?.leadQualifiedAt && selectedConv.leadIntent && (
              <div className={styles.leadBanner}>
                <span className={styles.leadBannerIcon}>🔥</span>
                <div className={styles.leadBannerBody}>
                  <div className={styles.leadBannerTitle}>AI marked this a qualified lead</div>
                  <div className={styles.leadBannerReason}>{selectedConv.leadIntent}</div>
                  <div className={styles.leadBannerMeta}>
                    Qualified {formatFullTime(selectedConv.leadQualifiedAt)}
                  </div>
                </div>
              </div>
            )}

            {/* CTWA ad referral banner — surfaced when this customer arrived
                via a click-to-WhatsApp ad. Helps the operator see context
                without scrolling to the first message. */}
            {selectedConv?.adContext && (selectedConv.adContext.title || selectedConv.adContext.body) && (
              <div className={styles.adBanner}>
                <MegaphoneIcon width={16} height={16} className={styles.adBannerIcon} />
                <div className={styles.adBannerBody}>
                  <div className={styles.adBannerTitle}>
                    From ad{selectedConv.adContext.title ? `: "${selectedConv.adContext.title}"` : ""}
                  </div>
                  {selectedConv.adContext.body && (
                    <div className={styles.adBannerDesc}>{selectedConv.adContext.body}</div>
                  )}
                  <div className={styles.adBannerMeta}>
                    Clicked {formatFullTime(selectedConv.adContext.capturedAt)}
                    {selectedConv.adContext.sourceUrl && (
                      <>
                        {" · "}
                        <a
                          href={selectedConv.adContext.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.adBannerLink}
                        >
                          View ad ↗
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className={styles.messages}>
              {messagesLoading && (
                <div className={styles.loadingMessages}>Loading messages…</div>
              )}
              {!messagesLoading && hasMoreOlder && (
                <button
                  type="button"
                  className={styles.loadOlderBtn}
                  onClick={loadOlder}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              )}
              {!messagesLoading && allMessages.map((msg) => (
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

            {/* Message input — always visible. Sending in AI mode auto-pauses
                the agent and flips the conversation to human mode (server-side). */}
            <div className={styles.inputWrap}>
              {sendMessage.isError && (
                <div className={styles.sendError}>
                  {sendMessage.error instanceof Error && sendMessage.error.message.toLowerCase().includes("cap")
                    ? "Daily message cap reached. Messages will resume tomorrow."
                    : (sendMessage.error instanceof Error ? sendMessage.error.message : "Failed to send message")}
                </div>
              )}
              {convMode === "ai" && (
                <div className={styles.aiHint}>
                  Sending a message will pause the AI for this conversation. You can resume it anytime.
                </div>
              )}
              <div className={styles.inputRow}>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
