import type { ChatMessage } from "../providers/types.js"
import type { OrchestratorAgent } from "../db/queries/agents.js"
import type { Message } from "../db/queries/conversations.js"
import { getRecentMessages } from "../db/queries/conversations.js"
import { retrieveRelevantChunks } from "../rag/indexer.js"
import { listMediaItems } from "../db/queries/media.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "context-builder" })

/**
 * Build the system prompt from agent config + RAG chunks + Media library.
 * Also injects personality, memory reminder, and current time.
 */
export async function buildSystemPrompt(
  agent: OrchestratorAgent,
  timezone: string,
  queryText?: string
): Promise<string> {
  const sections: string[] = []

  sections.push(agent.systemPrompt)

  if (agent.personality) {
    sections.push(`## Personality\n${agent.personality}`)
  }

  // Media Library: tell the AI what images are available to send
  try {
    const media = await listMediaItems(agent.agentId)
    if (media.length > 0) {
      const mediaList = media
        .map((m) => `- ID: ${m.id} | Description: "${m.description}"`)
        .join("\n")
      sections.push(`## Available media\nYou have access to the following images. You can send them using the 'send_image' tool when requested by the customer or when it would be helpful to show a product.\n\n${mediaList}`)
    }
  } catch (err: any) {
    logger.warn({ agentId: agent.agentId, err: err.message }, "Failed to fetch media library")
  }

  // RAG: inject top-5 relevant chunks from the document knowledge base
  if (queryText) {
    try {
      const chunks = await retrieveRelevantChunks(agent.agentId, queryText, 5)
      if (chunks.length > 0) {
        const ragSection = chunks
          .map((c) => `[From: ${c.filename}]\n${c.content}`)
          .join("\n\n")
        sections.push(`## Knowledge base\nRelevant information from uploaded documents:\n\n${ragSection}`)
        logger.debug({ agentId: agent.agentId, chunkCount: chunks.length }, "RAG chunks injected")
      }
    } catch (err: any) {
      // RAG failure should never break the response — degrade gracefully
      logger.warn({ agentId: agent.agentId, err: err.message }, "RAG retrieval failed — continuing without it")
    }
  }

  // §7: Summaries, facts — added in later PRs
  sections.push(`## Conversation memory\nYou have access to the full conversation history with this contact shown in the messages below. You CAN and DO remember everything said in this conversation. Reference previous messages naturally when relevant. Never claim you cannot remember the conversation.`)

  const now = new Date().toLocaleString("en-US", { timeZone: timezone })
  sections.push(`## Current time\n${now}`)

  return sections.join("\n\n")
}

/**
 * Build the messages array for the LLM from conversation history.
 * The current inbound message must already be inserted in DB before calling this.
 * getRecentMessages will include it as the last entry.
 */
export async function buildMessages(
  conversationId: string,
  shortTermWindow: number
): Promise<ChatMessage[]> {
  const recent = await getRecentMessages(conversationId, shortTermWindow)
  return recent.map((m) => mapMessage(m))
}

function mapMessage(m: Message): ChatMessage {
  let content: string = m.content ?? ""

  // Prepend image description if present
  if (m.mediaDescription) {
    content = `[Customer sent an image: ${m.mediaDescription}]\n\n${content}`
  }

  return {
    role: m.direction === "inbound" ? "user" : "assistant",
    content,
  }
}
