"use client"

import { useState } from "react"
import { OrchestratorChatsView } from "./OrchestratorChatsView"
import styles from "./ChatsClient.module.css"

interface Agent {
  id: string
  businessName: string
  elevenlabsAgentId: string | null
  profileImageUrl: string | null
  agentRuntime: string
  status: string
}

interface ChatsClientProps {
  agents: Agent[]
}

// Orchestrator-only chats. The legacy ElevenLabs view (Chats/Contacts tabs +
// ChatList/ContactsView/ConversationDrawer + voice-call list) was removed — the
// platform runs on the orchestrator runtime. ConversationDrawer is kept because
// LeadsClient still uses it.
export function ChatsClient({ agents }: ChatsClientProps) {
  const orchestratorAgents = agents.filter(
    (a) => a.agentRuntime === "orchestrator" && a.status === "ACTIVE"
  )
  const [selectedAgentId, setSelectedAgentId] = useState(orchestratorAgents[0]?.id ?? "")

  if (orchestratorAgents.length === 0) {
    return (
      <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
        No active agents yet — connect WhatsApp to start seeing conversations here.
      </div>
    )
  }

  return (
    <div>
      {orchestratorAgents.length > 1 && (
        <div className={styles.agentTabs} style={{ marginBottom: "1rem" }}>
          {orchestratorAgents.map((agent) => (
            <button
              key={agent.id}
              className={`${styles.agentTab} ${selectedAgentId === agent.id ? styles.agentTabActive : ""}`}
              onClick={() => setSelectedAgentId(agent.id)}
            >
              {agent.businessName}
            </button>
          ))}
        </div>
      )}
      <OrchestratorChatsView agentId={selectedAgentId} />
    </div>
  )
}

export default ChatsClient
