import type { FastifyInstance } from "fastify"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getOrchestratorAgent } from "../db/queries/agents.js"
import { getOrCreateConversation } from "../db/queries/conversations.js"
import { buildSystemPrompt } from "../orchestrator/context-builder.js"
import { runAgentTurn } from "../orchestrator/run-agent-turn.js"
import type { ChatMessage } from "../providers/types.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "route:chat" })

// Hard per-request output ceiling for the developer API, regardless of the
// agent's configured maxOutputTokens — caps the cost of any single call.
const API_MAX_OUTPUT_TOKENS = 1000

// Synchronous chat for the external developer API. Unlike /inbound (which
// enqueues for the WhatsApp worker), this runs the agent turn inline and
// RETURNS the reply + token usage so the calling Next.js route can bill it and
// hand the result back to the developer. Same engine (runAgentTurn) as WhatsApp.
const chatSchema = z.object({
  agentId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1),
  // Stable key so multi-turn API conversations reuse one Conversation row (and
  // its tool side-effects). Omitted → an ephemeral conversation per call.
  conversationId: z.string().min(1).optional(),
})

export async function chatRoutes(app: FastifyInstance) {
  app.post("/chat", async (req, reply) => {
    const parsed = chatSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() })
    }
    const { agentId, messages, conversationId } = parsed.data

    const agent = await getOrchestratorAgent(agentId)
    if (!agent) {
      return reply.code(404).send({ error: "Agent not found" })
    }

    // A real Conversation row gives the in-turn tools (handoff, lead) a valid id
    // and surfaces API chats in the dashboard. Keyed by the caller's
    // conversationId when provided, else an ephemeral key.
    const convKey = conversationId ?? `gen-${randomUUID()}`
    const conversation = await getOrCreateConversation(agentId, `api:${convKey}`, agent.id, {
      channel: "api",
    })

    // The developer owns the transcript and sends it each call; use it directly
    // as the LLM history (newest user message also feeds prompt-time context).
    const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
    const systemPrompt = await buildSystemPrompt(agent, "Africa/Lagos", lastUserText, null)
    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }))

    const turn = await runAgentTurn(
      agent,
      systemPrompt,
      history,
      { agentId, conversationId: conversation.id, senderJid: "" },
      {
        // No WhatsApp JID on this surface — don't offer the image-dispatch tool.
        includeSendImage: false,
        // Hard output cap so a single API call can't run up a huge bill.
        maxOutputTokens: Math.min(agent.maxOutputTokens, API_MAX_OUTPUT_TOKENS),
      }
    )

    logger.info(
      { agentId, conversationId: conversation.id, inputTokens: turn.inputTokens, outputTokens: turn.outputTokens },
      "API chat turn processed"
    )

    return reply.code(200).send({
      reply: turn.finalReply,
      usage: { input_tokens: turn.inputTokens, output_tokens: turn.outputTokens },
      conversationId: conversation.id,
    })
  })
}
