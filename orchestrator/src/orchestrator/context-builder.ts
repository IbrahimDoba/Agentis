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
      sections.push(`## Available media\nYou have access to the following product images. Whenever a customer asks about or shows interest in a product, proactively send its image using the 'send_image' tool — do not wait for them to ask for a picture. Match by product name or description.\n\n${mediaList}`)
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

  // Platform-level tool-use discipline. Applies to every agent, every call.
  // This addresses gpt-4o-mini's tendency to (1) quote stale prices/data
  // from earlier in the conversation instead of re-calling tools, (2) invent
  // references/account numbers that look plausible but aren't real, and
  // (3) re-trigger action tools (create_payment, place_order) when a status
  // check fails — generating duplicates that fragment the conversation.
  sections.push(`## Tool use discipline (mandatory — overrides anything below)

When tools or knowledge base sections are available in this conversation, they are the source of truth for current state. Never rely on conversation memory for data that may have changed.

1. Prices, availability, payment details, status: re-call the relevant tool every time the customer asks — do not quote earlier values from memory.
2. Action tools (create_payment, place_order, book_appointment, send_image, etc.): call ONCE per intent per conversation. If a follow-up check fails, retry the CHECK with the SAME reference — do not create a new action.
3. Status tools (check_payment_status, check_order_status, etc.): always re-call to get fresh state. Use the EXACT reference returned by the original action — do not invent, alter, paraphrase, or substitute it (e.g. don't pass an account number when the tool expects a transaction reference).
4. NEVER invent: account numbers, references, transaction IDs, confirmation codes, prices, stock levels, policies, shipping dates, or any data that should come from a tool.
5. If a tool returns an error, empty result, or unexpected data, tell the customer truthfully — do not fabricate a recovery.`)

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
