import { getOrchestratorAgent } from "../db/queries/agents.js"
import {
  getOrCreateConversation,
  insertMessage,
} from "../db/queries/conversations.js"
import { buildSystemPrompt, buildMessages } from "./context-builder.js"
import { dispatchReply } from "./response-dispatcher.js"
import { resolveProvider } from "../providers/registry.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "handle-inbound" })

export interface InboundPayload {
  agentId: string
  messageId: string
  fromPhone: string
  senderJid: string
  text: string
  timestamp: number
}

/**
 * Process an inbound WhatsApp message through the LLM pipeline.
 * Called by the inbound BullMQ worker after dedup + persistence.
 */
export async function handleInbound(payload: InboundPayload): Promise<void> {
  const startMs = Date.now()
  const { agentId, fromPhone, senderJid, text } = payload

  // 1. Load orchestrator agent config
  const agent = await getOrchestratorAgent(agentId)
  if (!agent) {
    logger.warn({ agentId }, "No active orchestrator agent found — skipping")
    return
  }

  // 2. Get or create conversation
  const conversation = await getOrCreateConversation(agentId, fromPhone, agent.id)

  // 3. Check mode
  if (conversation.mode === "human") {
    logger.info({ agentId, conversationId: conversation.id }, "Conversation in human mode — skipping AI reply")
    return
  }

  // 4. Insert inbound message
  await insertMessage({
    conversationId: conversation.id,
    direction: "inbound",
    content: text,
  })

  // 5. Build context
  const systemPrompt = buildSystemPrompt(agent, "Africa/Lagos")
  const messages = await buildMessages(conversation.id, text, agent.shortTermWindow)

  // 6. Call LLM
  const provider = resolveProvider(agent.model)
  const result = await provider.chat({
    model: agent.model,
    system: systemPrompt,
    messages,
    temperature: Number(agent.temperature),
    max_output_tokens: agent.maxOutputTokens,
  })

  const reply = result.content?.trim()
  if (!reply) {
    logger.warn({ agentId, conversationId: conversation.id }, "LLM returned empty reply")
    return
  }

  // 7. Output shaping — split long replies into multiple messages
  const replyParts = splitReply(reply)

  // 8. Persist outbound message(s)
  for (const part of replyParts) {
    await insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      content: part,
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
      modelUsed: agent.model,
    })
  }

  // 9. Dispatch via transport
  for (const part of replyParts) {
    await dispatchReply({
      agentId,
      conversationId: conversation.id,
      toJid: senderJid,
      text: part,
      source: "ai",
    })
  }

  const duration = Date.now() - startMs
  logger.info({
    agentId,
    conversationId: conversation.id,
    duration,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    replyParts: replyParts.length,
  }, "Inbound message processed")
}

/**
 * Split a long reply into multiple WhatsApp messages.
 * Only splits if >800 chars and has paragraph breaks.
 */
function splitReply(text: string): string[] {
  if (text.length <= 800) return [text]

  const paragraphs = text.split(/\n\n+/)
  if (paragraphs.length <= 1) return [text]

  // Group paragraphs into chunks of ~800 chars
  const parts: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (current && (current.length + para.length + 2) > 800) {
      parts.push(current.trim())
      current = para
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }
  if (current.trim()) parts.push(current.trim())

  return parts.length > 0 ? parts : [text]
}
