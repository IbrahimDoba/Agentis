import { getAgentTools, isProductAlbumEnabled, type OrchestratorAgent } from "../db/queries/agents.js"
import { resolveProvider } from "../providers/registry.js"
import { SEND_IMAGE_TOOL, executeSendImage } from "../tools/built-in/send-image.js"
import { SEND_PRODUCT_ALBUM_TOOL, executeSendProductAlbum } from "../tools/built-in/send-product-album.js"
import { REQUEST_HUMAN_HANDOFF_TOOL, executeRequestHumanHandoff } from "../tools/built-in/request-human-handoff.js"
import { MARK_QUALIFIED_LEAD_TOOL, executeMarkQualifiedLead } from "../tools/built-in/mark-qualified-lead.js"
import { buildWebhookToolDefinitions, executeWebhookTool } from "../tools/external/webhook-tools.js"
import type { ProductResponseMapping } from "./rich-content.js"
import { sql } from "../db/client.js"
import type { ChatMessage } from "../providers/types.js"
import { logger as rootLogger } from "../lib/logger.js"

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
  const ownerRows = await sql<{ userId: string }[]>`SELECT "userId" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1`
  const ownerUserId = ownerRows[0]?.userId ?? ""
  const albumEnabled = await isProductAlbumEnabled(agentId)
  const tools = [
    ...(includeSendImage ? [SEND_IMAGE_TOOL] : []),
    ...(albumEnabled ? [SEND_PRODUCT_ALBUM_TOOL] : []),
    REQUEST_HUMAN_HANDOFF_TOOL,
    MARK_QUALIFIED_LEAD_TOOL,
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
            conversationId,
            toJid: senderJid,
          })
        } else if (tc.name === "send_product_catalog") {
          toolResult = await executeSendProductAlbum(tc.arguments, {
            agentId,
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

  return {
    finalReply,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    collectedToolResults,
  }
}
