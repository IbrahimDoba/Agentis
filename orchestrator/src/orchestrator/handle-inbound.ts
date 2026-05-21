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
import { REQUEST_HUMAN_HANDOFF_TOOL, executeRequestHumanHandoff } from "../tools/built-in/request-human-handoff.js"
import { MARK_QUALIFIED_LEAD_TOOL, executeMarkQualifiedLead } from "../tools/built-in/mark-qualified-lead.js"
import { buildWebhookToolDefinitions, executeWebhookTool } from "../tools/external/webhook-tools.js"
import { buildRichContent, type ProductResponseMapping } from "./rich-content.js"
import { sql } from "../db/client.js"
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

  // 6. Call LLM — tool-calling loop (max 5 iterations to avoid runaway loops).
  // mark_qualified_lead needs the agent owner's userId so the Lead row is
  // attributed correctly. Fetch it once here rather than per-tool-call.
  const provider = resolveProvider(agent.model)
  const externalTools = await getAgentTools(agentId)
  const ownerRows = await sql<{ userId: string }[]>`SELECT "userId" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1`
  const ownerUserId = ownerRows[0]?.userId ?? ""
  const tools = [
    SEND_IMAGE_TOOL,
    REQUEST_HUMAN_HANDOFF_TOOL,
    MARK_QUALIFIED_LEAD_TOOL,
    ...buildWebhookToolDefinitions(externalTools),
  ]
  const currentMessages: ChatMessage[] = [...messages]
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let finalReply: string | null = null
  // Capture every external-tool result this turn so we can post-process them
  // into structured UI payloads (product cards, etc.) for the widget.
  const collectedToolResults: { toolName: string; rawResult: string; mapping?: ProductResponseMapping }[] = []

  // Cap raised from 5 → 8 to fit multi-step e-commerce flows (search →
  // cart_quote → shipping_quote → create_payment_link → create_order is
  // already 5 by itself, leaving no room for retries or extra lookups).
  const MAX_TOOL_ITERATIONS = 8
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
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
        } else if (tc.name === "request_human_handoff") {
          toolResult = await executeRequestHumanHandoff(tc.arguments, {
            agentId,
            conversationId: conversation.id,
          })
        } else if (tc.name === "mark_qualified_lead") {
          toolResult = await executeMarkQualifiedLead(tc.arguments, {
            agentId,
            conversationId: conversation.id,
            userId: ownerUserId,
          })
        } else if (externalTools.some((t) => t.name === tc.name)) {
          toolResult = await executeWebhookTool(tc.name, tc.arguments, externalTools)
          const def = externalTools.find((t) => t.name === tc.name)
          collectedToolResults.push({
            toolName: tc.name,
            rawResult: toolResult,
            // Cast: AgentTool stores the mapping as untyped JSON. The
            // extractor validates fields it actually uses, so a bad shape
            // just falls back to the heuristic — not a runtime hazard.
            mapping: def?.responseMapping as ProductResponseMapping | undefined,
          })
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

  // Fallback: loop ended without a text reply — either the model still
  // wanted to call tools at the cap, or it returned an empty turn with
  // no content and no tool_calls (rare OpenAI edge case after a long
  // tool chain). Force one more call with tools disabled so the model
  // MUST produce text. Without this, the customer just sees silence.
  if (!finalReply) {
    logger.warn({ agentId, conversationId: conversation.id }, "LLM produced no text reply — forcing closing turn with tools disabled")
    try {
      const closing = await provider.chat({
        model: agent.model,
        system: systemPrompt,
        messages: currentMessages,
        tools: [],
        temperature: Number(agent.temperature),
        max_output_tokens: agent.maxOutputTokens,
      })
      totalInputTokens += closing.usage.input_tokens
      totalOutputTokens += closing.usage.output_tokens
      finalReply = closing.content?.trim() ?? null
    } catch (err) {
      logger.error({ agentId, conversationId: conversation.id, err }, "Forced text-reply call failed")
    }
  }

  if (!finalReply) {
    logger.warn({ agentId, conversationId: conversation.id }, "LLM returned empty reply")
    return
  }

  // 7. Output shaping — split long replies into multiple messages
  const replyParts = splitReply(finalReply)

  // Build structured payload (product cards etc.) from the tool results
  // captured during the LLM loop. Attaches only to the first part so the
  // cards don't render twice when a long reply gets split.
  const richContent = buildRichContent(collectedToolResults)

  // 8. Persist outbound message(s)
  for (let i = 0; i < replyParts.length; i++) {
    await insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      content: replyParts[i],
      richContent: i === 0 ? richContent ?? undefined : undefined,
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
