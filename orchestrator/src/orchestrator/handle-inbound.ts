import { getOrchestratorAgent, isAiRepliesPaused, isReplyGuardEnabled } from "../db/queries/agents.js"
import {
  getOrCreateConversation,
  insertMessage,
  setConversationAdContextIfEmpty,
  getConversationMessageCount,
  type AdContext,
} from "../db/queries/conversations.js"
import { buildSystemPrompt, buildMessages } from "./context-builder.js"
import { dispatchReply } from "./response-dispatcher.js"
import { buildRichContent } from "./rich-content.js"
import { publishSseEvent } from "../lib/sse-publish.js"
import { runAgentTurn } from "./run-agent-turn.js"
import { guardReply } from "./reply-guard.js"
import { executeRequestHumanHandoff } from "../tools/built-in/request-human-handoff.js"
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
  // Inbound image (data URL or https) for vision — attached to this turn only.
  imageDataUrl?: string
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

  // Real-time: tell any open dashboard stream a customer message landed, so it
  // shows immediately — even when AI is paused (human-handoff mode below).
  await publishSseEvent(agentId, "message", {
    conversationId: conversation.id,
    direction: "inbound",
  })

  // 4. Check mode — skip AI reply if human is handling this conversation
  if (conversation.mode === "human") {
    logger.info({ agentId, conversationId: conversation.id }, "Conversation in human handoff mode — skipping AI reply")
    return
  }

  // 4b. Global master switch — skip the AI for ALL conversations when the agent
  // has "AI replies" turned off (the inbound message is still saved above).
  if (await isAiRepliesPaused(agentId)) {
    logger.info({ agentId, conversationId: conversation.id }, "AI replies disabled for agent — skipping AI reply")
    return
  }

  // 5. Build context. Only inject the ad referral section during the
  // opening exchanges so the AI doesn't keep referencing the ad weeks
  // later for unrelated questions.
  const messageCount = await getConversationMessageCount(conversation.id)
  const adContextForPrompt = effectiveAdContext && messageCount <= 6 ? effectiveAdContext : null
  const systemPrompt = await buildSystemPrompt(agent, "Africa/Lagos", text, adContextForPrompt)
  const messages = await buildMessages(conversation.id, agent.shortTermWindow)

  // 6. Run the agent turn (LLM tool-calling loop). Extracted into runAgentTurn
  // so the WhatsApp/embed inbound path and the synchronous developer API share
  // one engine and can't drift.
  const turn = await runAgentTurn(agent, systemPrompt, messages, {
    agentId,
    conversationId: conversation.id,
    senderJid,
    imageDataUrl: payload.imageDataUrl,
  })
  const totalInputTokens = turn.inputTokens
  const totalOutputTokens = turn.outputTokens
  const collectedToolResults = turn.collectedToolResults
  const finalReply = turn.finalReply

  if (!finalReply) {
    logger.warn({ agentId, conversationId: conversation.id }, "LLM returned empty reply")
    return
  }

  // 7. Guard (optional, per-agent toggle — off by default). When enabled, a
  // second model oversees the reply before it goes out: it keeps a good reply,
  // rewrites a repetitive/rambling/awkward one into the right short reply, or
  // hands off to a human. It NEVER suppresses — the customer always gets a
  // reply. When disabled, the AI's reply is sent exactly as written.
  let effectiveReply = finalReply
  if (await isReplyGuardEnabled(agentId)) {
    const guard = await guardReply(messages, finalReply)

    if (guard.action === "handoff") {
      await executeRequestHumanHandoff(
        { reason: guard.reason, urgency: guard.urgency },
        { agentId, conversationId: conversation.id }
      ).catch((err) => logger.error({ err, agentId }, "Guard-triggered handoff failed"))
    }

    effectiveReply = guard.message
  }

  // 7b. Output shaping — split long replies into multiple messages
  const replyParts = splitReply(effectiveReply)

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

  // Real-time: notify open dashboard streams that the AI reply is persisted.
  await publishSseEvent(agentId, "message", {
    conversationId: conversation.id,
    direction: "outbound",
  })

  // 9. Dispatch via transport. Embed conversations skip the Baileys worker
  // round-trip — the outbound rows persisted at step 8 are picked up by
  // the visitor's widget via polling on /api/embed/messages.
  if (channel !== "embed") {
    for (let i = 0; i < replyParts.length; i++) {
      await dispatchReply({
        agentId,
        conversationId: conversation.id,
        toJid: senderJid,
        text: replyParts[i],
        source: "ai",
        // PAYG: charge the full turn's tokens against the FIRST part only.
        // Subsequent parts pass 0/0 so the worker doesn't double-charge.
        tokensInput: i === 0 ? totalInputTokens : 0,
        tokensOutput: i === 0 ? totalOutputTokens : 0,
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
