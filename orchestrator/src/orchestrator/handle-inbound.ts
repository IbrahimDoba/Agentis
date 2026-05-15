import { getOrchestratorAgent, getAgentTools } from "../db/queries/agents.js"
import {
  getOrCreateConversation,
  insertMessage,
  setConversationAdContextIfEmpty,
  getConversationMessageCount,
  type AdContext,
} from "../db/queries/conversations.js"
import { buildSystemPrompt, buildMessages } from "./context-builder.js"
import { dispatchReply } from "./response-dispatcher.js"
import { resolveProvider } from "../providers/registry.js"
import { SEND_IMAGE_TOOL, executeSendImage } from "../tools/built-in/send-image.js"
import { buildWebhookToolDefinitions, executeWebhookTool } from "../tools/external/webhook-tools.js"
import type { ChatMessage } from "../providers/types.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "handle-inbound" })

export interface InboundPayload {
  agentId: string
  messageId: string
  fromPhone: string
  senderJid: string
  text: string
  timestamp: number
  pushName?: string
  adContext?: AdContext
  // Embed-widget transport. When "embed", the orchestrator skips Baileys
  // dispatch and just persists the outbound reply — the visitor's widget
  // picks it up via polling.
  channel?: "whatsapp" | "embed"
  visitorId?: string
}

/**
 * Process an inbound WhatsApp message through the LLM pipeline.
 * Called by the inbound BullMQ worker after dedup + persistence.
 */
export async function handleInbound(payload: InboundPayload): Promise<void> {
  const startMs = Date.now()
  const { agentId, fromPhone, senderJid, text, pushName, adContext: incomingAdContext } = payload
  const channel = payload.channel ?? "whatsapp"

  // 1. Load orchestrator agent config
  const agent = await getOrchestratorAgent(agentId)
  if (!agent) {
    logger.warn({ agentId }, "No orchestrator agent found — skipping")
    return
  }

  // 2. Get or create conversation. For embed channel we attach the visitorId
  // so the dashboard / queries can distinguish web from WhatsApp without
  // pattern-matching phoneNumber.
  const conversation = await getOrCreateConversation(
    agentId,
    fromPhone,
    agent.id,
    {
      contactName: pushName,
      channel,
      visitorId: payload.visitorId,
    }
  )

  // 2a. Persist CTWA ad context on first detection. Sticky-first — won't
  // overwrite an existing value, so a later ad click can't clobber the
  // original context the AI used to greet the customer.
  let effectiveAdContext = conversation.adContext
  if (incomingAdContext && !effectiveAdContext) {
    const stored = await setConversationAdContextIfEmpty(conversation.id, incomingAdContext)
    if (stored) {
      effectiveAdContext = incomingAdContext
      logger.info({ agentId, conversationId: conversation.id, adTitle: incomingAdContext.title }, "Captured CTWA ad referral on conversation")
    }
  }

  // 3. Always save the inbound message regardless of mode. We pass the
  // payload's messageId as the row id so the widget's optimistic-render
  // id matches the DB row exactly — prevents the double-bubble problem
  // when polling fetches the same content back. messageId is already
  // unique and is also our dedup key, so reusing it as a row id is safe.
  await insertMessage({
    conversationId: conversation.id,
    direction: "inbound",
    content: text,
    id: payload.messageId,
  })

  // 4. Check mode — skip AI reply if human is handling this conversation
  if (conversation.mode === "human") {
    logger.info({ agentId, conversationId: conversation.id }, "Conversation in human handoff mode — skipping AI reply")
    return
  }

  // 5. Build context. Only inject the ad referral section during the
  // opening exchanges so the AI doesn't keep referencing the ad weeks
  // later for unrelated questions.
  const messageCount = await getConversationMessageCount(conversation.id)
  const adContextForPrompt = effectiveAdContext && messageCount <= 6 ? effectiveAdContext : null
  const systemPrompt = await buildSystemPrompt(agent, "Africa/Lagos", text, adContextForPrompt)
  const messages = await buildMessages(conversation.id, agent.shortTermWindow)

  // 6. Call LLM — tool-calling loop (max 5 iterations to avoid runaway loops)
  const provider = resolveProvider(agent.model)
  const externalTools = await getAgentTools(agentId)
  const tools = [SEND_IMAGE_TOOL, ...buildWebhookToolDefinitions(externalTools)]
  const currentMessages: ChatMessage[] = [...messages]
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let finalReply: string | null = null

  for (let iteration = 0; iteration < 5; iteration++) {
    const result = await provider.chat({
      model: agent.model,
      system: systemPrompt,
      messages: currentMessages,
      tools,
      temperature: Number(agent.temperature),
      max_output_tokens: agent.maxOutputTokens,
    })

    totalInputTokens += result.usage.input_tokens
    totalOutputTokens += result.usage.output_tokens

    if (result.finish_reason === "tool_calls" && result.tool_calls.length > 0) {
      // Append assistant message with tool calls to history
      currentMessages.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.tool_calls,
      })

      // Execute each tool and append results
      for (const tc of result.tool_calls) {
        let toolResult: string

        if (tc.name === "send_image") {
          toolResult = await executeSendImage(tc.arguments, {
            agentId,
            conversationId: conversation.id,
            toJid: senderJid,
          })
        } else if (externalTools.some((t) => t.name === tc.name)) {
          toolResult = await executeWebhookTool(tc.name, tc.arguments, externalTools)
        } else {
          toolResult = JSON.stringify({ error: `Unknown tool: ${tc.name}` })
        }

        logger.debug({ agentId, tool: tc.name, toolResult }, "Tool executed")

        currentMessages.push({
          role: "tool",
          content: toolResult,
          tool_call_id: tc.id,
        })
      }
      // Continue loop to let LLM generate the final text reply
    } else {
      finalReply = result.content?.trim() ?? null
      break
    }
  }

  if (!finalReply) {
    logger.warn({ agentId, conversationId: conversation.id }, "LLM returned empty reply")
    return
  }

  // 7. Output shaping — split long replies into multiple messages
  const replyParts = splitReply(finalReply)

  // 8. Persist outbound message(s)
  for (const part of replyParts) {
    await insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      content: part,
      tokensInput: totalInputTokens,
      tokensOutput: totalOutputTokens,
      modelUsed: agent.model,
    })
  }

  // 9. Dispatch via transport. Embed conversations skip the Baileys worker
  // round-trip — the outbound rows persisted at step 8 are picked up by
  // the visitor's widget via polling on /api/embed/messages.
  if (channel !== "embed") {
    for (const part of replyParts) {
      await dispatchReply({
        agentId,
        conversationId: conversation.id,
        toJid: senderJid,
        text: part,
        source: "ai",
      })
    }
  }

  const duration = Date.now() - startMs
  logger.info({
    agentId,
    conversationId: conversation.id,
    duration,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
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
