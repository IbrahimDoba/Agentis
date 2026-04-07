"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChatList } from "./ChatList"
import { ContactsView } from "./ContactsView"
import { ConversationDrawer } from "./ConversationDrawer"
import type { Conversation } from "@/types"
import styles from "./ChatsClient.module.css"

interface Agent {
  id: string
  businessName: string
  elevenlabsAgentId: string | null
  profileImageUrl: string | null
}

interface ChatsClientProps {
  agents: Agent[]
}

function getCallerNumber(conv: Conversation): string | undefined {
  const m = conv.metadata
  if (!m) return undefined
  return m.from_number || m.caller_id || m.phone_call?.external_number || m.phone_call?.from || m.initiator_identifier || undefined
}

export function ChatsClient({ agents }: ChatsClientProps) {
  const connectedAgents = agents.filter((a) => !!a.elevenlabsAgentId)
  const [selectedAgentId, setSelectedAgentId] = useState(connectedAgents[0]?.id ?? "")
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [viewTab, setViewTab] = useState<"chats" | "contacts">("chats")
  const queryClient = useQueryClient()
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Extra pages from infinite scroll (page 2+). Page 1 always comes directly from useQuery.
  const [extraPages, setExtraPages] = useState<Conversation[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isFetchingMore, setIsFetchingMore] = useState(false)

  const { data, isLoading, error } = useQuery<{ conversations: Conversation[]; has_more: boolean; next_cursor: string | null }>({
    queryKey: ["chats", selectedAgentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${selectedAgentId}/conversations`)
      if (!res.ok) throw new Error("Failed to fetch conversations")
      return res.json()
    },
    enabled: !!selectedAgentId,
    staleTime: 20 * 1000,
    refetchInterval: 20 * 1000,
  })

  // Derive conversations directly from React Query data — no intermediate state needed.
  // This means page 1 is always in sync with the cache instantly (no effect delay, no flash).
  const conversations = useMemo(
    () => [...(data?.conversations ?? []), ...extraPages],
    [data, extraPages]
  )

  // Keep pagination state in sync when page 1 refreshes
  useEffect(() => {
    if (data) {
      setHasMore(data.has_more)
      setCursor(data.next_cursor)
    }
  }, [data])

  // Clear extra scroll pages when switching agents
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    setExtraPages([])
    setHasMore(false)
    setCursor(null)
  }, [selectedAgentId])

  const fetchMore = useCallback(async () => {
    if (!cursor || isFetchingMore) return
    setIsFetchingMore(true)
    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/conversations?cursor=${cursor}`)
      if (!res.ok) return
      const page = await res.json()
      setExtraPages((prev) => [...prev, ...page.conversations])
      setHasMore(page.has_more)
      setCursor(page.next_cursor)
    } finally {
      setIsFetchingMore(false)
    }
  }, [cursor, isFetchingMore, selectedAgentId])

  const { data: readData } = useQuery<{ readIds: string[] }>({
    queryKey: ["conversation-reads"],
    queryFn: async () => {
      const res = await fetch("/api/conversations/read")
      if (!res.ok) return { readIds: [] }
      return res.json()
    },
    staleTime: 60 * 1000,
  })

  const { data: leadsData } = useQuery<{ leads: { conversationId: string }[] }>({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads")
      if (!res.ok) return { leads: [] }
      return res.json()
    },
    staleTime: 30 * 1000,
  })

  const readIds = new Set(readData?.readIds ?? [])
  const leadIds = new Set(leadsData?.leads.map((l) => l.conversationId) ?? [])

  // Infinite scroll — trigger next page when sentinel comes into view
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          fetchMore()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isFetchingMore, fetchMore])

  // Run AI lead detection after conversations load
  useEffect(() => {
    if (!conversations.length || !selectedAgentId) return
    const toSend = conversations
      .filter((c) => c.status === "done" && (c.transcript_summary || c.call_summary_title))
      .map((c) => ({
        conversationId: c.conversation_id,
        callerNumber: getCallerNumber(c),
        summary: c.transcript_summary ?? undefined,
        title: c.call_summary_title ?? undefined,
      }))
    if (!toSend.length) return

    fetch(`/api/agents/${selectedAgentId}/conversations/detect-leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: toSend }),
    }).then((r) => {
        if (r.ok) queryClient.invalidateQueries({ queryKey: ["leads"] })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedAgentId])

  const markRead = useCallback(async (conversationId: string) => {
    if (readIds.has(conversationId)) return
    await fetch("/api/conversations/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    })
    queryClient.setQueryData<{ readIds: string[] }>(["conversation-reads"], (old) => ({
      readIds: [...(old?.readIds ?? []), conversationId],
    }))
  }, [readIds, queryClient])

  const handleSelect = useCallback((id: string) => {
    setSelectedConvId(id)
    markRead(id)
  }, [markRead])

  const handleClose = useCallback(() => setSelectedConvId(null), [])

  const handleAgentSwitch = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    setSelectedConvId(null)
  }, [])

  // Show skeletons only on the very first load when there's no data at all
  const showSkeletons = isLoading && conversations.length === 0

  return (
    <div>
      {/* View tabs + agent tabs */}
      <div className={styles.topBar}>
        <div className={styles.viewTabs}>
          <button
            className={`${styles.viewTab} ${viewTab === "chats" ? styles.viewTabActive : ""}`}
            onClick={() => setViewTab("chats")}
          >
            Chats
          </button>
          <button
            className={`${styles.viewTab} ${viewTab === "contacts" ? styles.viewTabActive : ""}`}
            onClick={() => setViewTab("contacts")}
          >
            Contacts
          </button>
        </div>

        {connectedAgents.length > 1 && (
          <div className={styles.agentTabs}>
            {connectedAgents.map((agent) => (
              <button
                key={agent.id}
                className={`${styles.agentTab} ${selectedAgentId === agent.id ? styles.agentTabActive : ""}`}
                onClick={() => handleAgentSwitch(agent.id)}
              >
                {agent.businessName}
              </button>
            ))}
          </div>
        )}
      </div>

      {showSkeletons && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              height: 100,
              borderRadius: 16,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: "1rem",
          background: "var(--danger-light)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--danger)",
        }}>
          Failed to load conversations. Please refresh the page.
        </div>
      )}

      {!showSkeletons && !error && viewTab === "chats" && (
        <>
          <ChatList
            conversations={conversations}
            readIds={readIds}
            leadIds={leadIds}
            onSelect={handleSelect}
          />
          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} style={{ height: 1 }} />
          {isFetchingMore && (
            <div style={{ textAlign: "center", padding: "1rem", fontSize: 13, color: "var(--muted)" }}>
              Loading more…
            </div>
          )}
        </>
      )}

      {viewTab === "contacts" && (
        <ContactsView
          agentId={selectedAgentId}
        />
      )}

      {viewTab === "chats" && (
        <ConversationDrawer
          conversationId={selectedConvId}
          agentId={selectedAgentId}
          onClose={handleClose}
          isLead={selectedConvId ? leadIds.has(selectedConvId) : false}
          conversation={selectedConvId ? conversations.find((c) => c.conversation_id === selectedConvId) : undefined}
        />
      )}
    </div>
  )
}

export default ChatsClient
