"use client"

import { useState, useCallback } from "react"
import { useConversations } from "@/hooks/useConversations"
import { ChatList } from "./ChatList"
import { ConversationDrawer } from "./ConversationDrawer"

export function ChatsClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: conversations = [], isLoading, error } = useConversations()

  const handleClose = useCallback(() => setSelectedId(null), [])

  if (isLoading) {
    return (
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
    )
  }

  if (error) {
    return (
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
    )
  }

  return (
    <>
      <ChatList conversations={conversations} onSelect={setSelectedId} />
      <ConversationDrawer conversationId={selectedId} onClose={handleClose} />
    </>
  )
}

export default ChatsClient
