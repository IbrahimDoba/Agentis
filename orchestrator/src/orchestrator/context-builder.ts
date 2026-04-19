import type { ChatMessage } from "../providers/types.js"
import type { OrchestratorAgent } from "../db/queries/agents.js"
import type { Message } from "../db/queries/conversations.js"
import { getRecentMessages } from "../db/queries/conversations.js"

/**
 * Build the system prompt from agent config + memory tiers.
 * PR1: short-term memory only. Summaries, facts, RAG, media added in later PRs.
 */
export function buildSystemPrompt(agent: OrchestratorAgent, timezone: string): string {
  const sections: string[] = []

  sections.push(agent.systemPrompt)

  if (agent.personality) {
    sections.push(`## Personality\n${agent.personality}`)
  }

  // §7: Summaries, facts, RAG, media — added in PR2-6
  // Placeholder sections will be injected here by later PRs

  const now = new Date().toLocaleString("en-US", { timeZone: timezone })
  sections.push(`## Current time\n${now}`)

  return sections.join("\n\n")
}

/**
 * Build the messages array for the LLM from conversation history + current message.
 */
export async function buildMessages(
  conversationId: string,
  currentText: string,
  shortTermWindow: number
): Promise<ChatMessage[]> {
  // Load recent messages (short-term memory)
  const recent = await getRecentMessages(conversationId, shortTermWindow)

  const messages: ChatMessage[] = recent.map((m) => mapMessage(m))

  // Add current inbound message
  messages.push({ role: "user", content: currentText })

  return messages
}

function mapMessage(m: Message): ChatMessage {
  let content = m.content

  // Prepend image description if present
  if (m.mediaDescription) {
    content = `[Customer sent an image: ${m.mediaDescription}]\n\n${content}`
  }

  return {
    role: m.direction === "inbound" ? "user" : "assistant",
    content,
  }
}
