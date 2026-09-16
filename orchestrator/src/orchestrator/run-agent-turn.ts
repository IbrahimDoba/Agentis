import { getAgentTools, isProductAlbumEnabled, type OrchestratorAgent } from "../db/queries/agents.js"
import { resolveProvider } from "../providers/registry.js"
import { SEND_IMAGE_TOOL, executeSendImage } from "../tools/built-in/send-image.js"
import { SEND_PRODUCT_IMAGE_TOOL, executeSendProductImage } from "../tools/built-in/send-product-image.js"
import { SEND_PRODUCT_ALBUM_TOOL, executeSendProductAlbum } from "../tools/built-in/send-product-album.js"
import { SEND_PRODUCT_PHOTOS_TOOL, executeSendProductPhotos } from "../tools/built-in/send-product-photos.js"
import { REQUEST_HUMAN_HANDOFF_TOOL, executeRequestHumanHandoff } from "../tools/built-in/request-human-handoff.js"
import { MARK_QUALIFIED_LEAD_TOOL, executeMarkQualifiedLead } from "../tools/built-in/mark-qualified-lead.js"
import { SCHEDULE_APPOINTMENT_TOOL, executeScheduleAppointment } from "../tools/built-in/schedule-appointment.js"
import { TAG_CONVERSATION_TOOL, executeTagConversation } from "../tools/built-in/tag-conversation.js"
import { isChatTaggingEnabled } from "../db/queries/labels.js"
import { buildWebhookToolDefinitions, executeWebhookTool } from "../tools/external/webhook-tools.js"
import type { ProductResponseMapping } from "./rich-content.js"
import { sql } from "../db/client.js"
import type { ChatMessage } from "../providers/types.js"
import { logger as rootLogger } from "../lib/logger.js"
import { stripImageUrls } from "../lib/strip-image-urls.js"

const logger = rootLogger.child({ module: "run-agent-turn" })

// Everything the tool executors need that isn't on the agent config itself.
export interface AgentTurnContext {
  agentId: string // parent Agent (business) id — tools + owner lookup key off this
  conversationId: string
  senderJid: string // WhatsApp JID for send_image dispatch; "" when not applicable
  // When the inbound message carried an image, this is its data/https URL. It's
  // attached to the current turn's user message so the (vision-capable) model
  // can see it. Not persisted — only this turn sees it.
  imageDataUrl?: string
}

export interface CollectedToolResult {
  toolName: string
  rawResult: string
  mapping?: ProductResponseMapping
}

export interface AgentTurnResult {
  finalReply: string | null
  inputTokens: number
  outputTokens: number
  collectedToolResults: CollectedToolResult[]
}

export interface AgentTurnOptions {
  // send_image dispatches an image to a WhatsApp JID. Surfaces without a JID
  // (the developer API) set this false so the tool isn't offered. Defaults to
  // true to preserve the WhatsApp/embed behaviour exactly.
  includeSendImage?: boolean
  // Override the per-call output token ceiling. The developer API passes a hard
  // cap so a single call can't run up a huge bill. Defaults to the agent's
  // configured maxOutputTokens.
  maxOutputTokens?: number
}

// Cap raised from 5 → 8 to fit multi-step e-commerce flows (search →
// cart_quote → shipping_quote → create_payment_link → create_order is
// already 5 by itself, leaving no room for retries or extra lookups).
const MAX_TOOL_ITERATIONS = 8

// Per-turn input-token circuit breaker. Each iteration re-sends the full
// context, so a tool that returns large bodies (search endpoints slice to
// 12k chars) makes input compound across iterations — one JustFits turn hit
// 137k input tokens looping on product search. This bounds the worst case
// without lowering MAX_TOOL_ITERATIONS (load-bearing for the order flows
// above): legit multi-step flows carry small tool payloads and stay well
// under this; a runaway trips it and we force a closing reply. ~$0.012/turn
// ceiling on gpt-4o-mini.
const MAX_TOTAL_INPUT_TOKENS = 80_000

// The agent's LLM tool-calling loop: given an agent config, a system prompt, and
// the message history, drive the provider through tool calls until it produces a
// text reply (forcing a tools-disabled closing turn if it never does), and
// report the reply + token usage + any external-tool results.
//
// This is the single shared engine behind every surface — the WhatsApp/embed
// inbound handler and the synchronous developer API both call it, so the two
// can't drift.
export async function runAgentTurn(
  agent: OrchestratorAgent,
  systemPrompt: string,
  history: ChatMessage[],
  ctx: AgentTurnContext,
  options: AgentTurnOptions = {}
): Promise<AgentTurnResult> {
  const { agentId, conversationId, senderJid } = ctx
  const includeSendImage = options.includeSendImage ?? true
  const maxOutputTokens = options.maxOutputTokens ?? agent.maxOutputTokens

  // mark_qualified_lead needs the agent owner's userId so the Lead row is
  // attributed correctly. Fetch it once here rather than per-tool-call.
  const provider = resolveProvider(agent.model)
  const externalTools = await getAgentTools(agentId)
  const ownerRows = await sql<{ userId: string; appointmentSchedulingEnabled: boolean }[]>`
    SELECT "userId", "appointmentSchedulingEnabled" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1`
  const ownerUserId = ownerRows[0]?.userId ?? ""
  const appointmentEnabled = ownerRows[0]?.appointmentSchedulingEnabled ?? false
  const albumEnabled = await isProductAlbumEnabled(agentId)
  // Chat tagging needs a WhatsApp chat to act on (senderJid), so it's gated by
  // includeSendImage (the dev API omits it) as well as the per-agent toggle.
  const taggingEnabled = await isChatTaggingEnabled(agentId)
  const tools = [
    // Specific-product images: when the album feature is ON the AI shows a
    // product's full set of photos (all angles) via send_product_photos; when
    // OFF it falls back to a single image via send_image. Both send to a
    // WhatsApp JID, so they're gated by includeSendImage (the dev API omits it).
    ...(includeSendImage ? (albumEnabled ? [SEND_PRODUCT_PHOTOS_TOOL] : [SEND_IMAGE_TOOL]) : []),
    ...(albumEnabled ? [SEND_PRODUCT_ALBUM_TOOL] : []),
    // Webhook-catalogue images: when an agent's products come from external
    // tools (not the DailZero media library), let the AI send a photo by the
    // `imageUrl` those tools return — instead of pasting a raw link in the text.
    ...(includeSendImage && externalTools.length > 0 ? [SEND_PRODUCT_IMAGE_TOOL] : []),
    ...(includeSendImage && taggingEnabled ? [TAG_CONVERSATION_TOOL] : []),
    REQUEST_HUMAN_HANDOFF_TOOL,
    MARK_QUALIFIED_LEAD_TOOL,
    // Appointment booking: offered only to agents whose business does it
    // (per-agent flag). Not tied to a WhatsApp JID, so it also works on embed.
    ...(appointmentEnabled ? [SCHEDULE_APPOINTMENT_TOOL] : []),
    ...buildWebhookToolDefinitions(externalTools),
  ]
  const currentMessages: ChatMessage[] = [...history]

  // Vision: if the inbound message carried an image, attach it to the most
  // recent user message so the model can actually see it this turn.
  if (ctx.imageDataUrl) {
    for (let i = currentMessages.length - 1; i >= 0; i--) {
      if (currentMessages[i].role === "user") {
        const existing = typeof currentMessages[i].content === "string" ? (currentMessages[i].content as string) : ""
        currentMessages[i] = {
          ...currentMessages[i],
          content: [
            { type: "text", text: existing || "[Image]" },
            { type: "image_url", image_url: { url: ctx.imageDataUrl } },
          ],
        }
        break
      }
    }
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let finalReply: string | null = null
  // Capture every external-tool result this turn so callers can post-process
  // them into structured UI payloads (product cards, etc.).
  const collectedToolResults: CollectedToolResult[] = []

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await provider.chat({
      model: agent.model,
      system: systemPrompt,
      messages: currentMessages,
      tools,
      temperature: Number(agent.temperature),
      max_output_tokens: maxOutputTokens,
    })

    totalInputTokens += result.usage.input_tokens
    totalOutputTokens += result.usage.output_tokens

    // Circuit breaker: if this turn has already spent its input-token budget,
    // stop calling tools even if the model wants more — fall through to take
    // whatever text it produced (or the forced closing reply below). Prevents a
    // runaway tool loop from ballooning cost.
    const overTokenBudget = totalInputTokens > MAX_TOTAL_INPUT_TOKENS
    if (overTokenBudget) {
      logger.warn(
        { agentId, conversationId, totalInputTokens, iteration },
        "Per-turn input-token budget exceeded — cutting off the tool loop"
      )
    }

    if (
      !overTokenBudget &&
      result.finish_reason === "tool_calls" &&
      result.tool_calls.length > 0
    ) {
      // Append assistant message with tool calls to history
      currentMessages.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.tool_calls,
      })

      // Execute each tool and append results
      for (const tc of result.tool_calls) {
        let toolResult: string

        if (tc.name === "send_media" || tc.name === "send_image") {
          toolResult = await executeSendImage(tc.arguments, {
            agentId,
            conversationId,
            toJid: senderJid,
          })
        } else if (tc.name === "send_product_image") {
          toolResult = await executeSendProductImage(tc.arguments, {
            agentId,
            conversationId,
            toJid: senderJid,
          })
        } else if (tc.name === "send_product_catalog") {
          toolResult = await executeSendProductAlbum(tc.arguments, {
            agentId,
            conversationId,
            toJid: senderJid,
          })
        } else if (tc.name === "tag_conversation") {
          toolResult = await executeTagConversation(tc.arguments, {
            agentId,
            conversationId,
            toJid: senderJid,
          })
        } else if (tc.name === "send_product_photos") {
          toolResult = await executeSendProductPhotos(tc.arguments, {
            agentId,
            conversationId,
            toJid: senderJid,
          })
        } else if (tc.name === "request_human_handoff") {
          toolResult = await executeRequestHumanHandoff(tc.arguments, {
            agentId,
            conversationId,
          })
        } else if (tc.name === "mark_qualified_lead") {
          toolResult = await executeMarkQualifiedLead(tc.arguments, {
            agentId,
            conversationId,
            userId: ownerUserId,
          })
        } else if (tc.name === "schedule_appointment") {
          toolResult = await executeScheduleAppointment(tc.arguments, {
            agentId,
            conversationId,
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
          // Strip raw image URLs before the model sees the result — otherwise it
          // pastes them into the reply as ugly markdown images. The raw result
          // was already captured above (collectedToolResults) for embed cards.
          content: stripImageUrls(toolResult),
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
    logger.warn({ agentId, conversationId }, "LLM produced no text reply — forcing closing turn with tools disabled")
    try {
      const closing = await provider.chat({
        model: agent.model,
        system: systemPrompt,
        messages: currentMessages,
        tools: [],
        temperature: Number(agent.temperature),
        max_output_tokens: maxOutputTokens,
      })
      totalInputTokens += closing.usage.input_tokens
      totalOutputTokens += closing.usage.output_tokens
      finalReply = closing.content?.trim() ?? null
    } catch (err) {
      logger.error({ agentId, conversationId, err }, "Forced text-reply call failed")
    }
  }

  // Belt-and-suspenders: small models sometimes VERBALISE a tool call as text
  // (e.g. appending "*request_human_handoff*") instead of, or as well as,
  // actually calling it. Strip any tool-name token from the customer-facing
  // reply so it can never leak, whatever the model does.
  if (finalReply) {
    const toolNames = [
      "request_human_handoff", "mark_qualified_lead", "schedule_appointment",
      "send_media", "send_image", "send_product_photos", "send_product_catalog",
      "send_product_album", "send_product_image", "tag_conversation",
      ...externalTools.map((t) => t.name),
    ]
    finalReply = stripToolLeaks(finalReply, toolNames) || "One moment please \u{1F64F}"
  }

  return {
    finalReply,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    collectedToolResults,
  }
}

// Remove any tool-name token from customer-facing text. Small models sometimes
// print the tool name (often wrapped like "*request_human_handoff*") rather than
// calling it. Strips the name plus any wrapping markdown/parens and adjacent
// punctuation, then tidies the whitespace it leaves behind.
function stripToolLeaks(text: string, toolNames: string[]): string {
  let out = text
  for (const raw of toolNames) {
    const name = raw?.trim()
    if (!name) continue
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`\\s*[*_\`(]{0,2}\\s*${esc}\\s*[*_\`)]{0,2}\\s*[.!:]?`, "gi")
    out = out.replace(re, " ")
  }
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}
