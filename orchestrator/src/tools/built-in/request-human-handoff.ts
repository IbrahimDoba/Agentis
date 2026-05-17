import type { ToolDefinition } from "../../providers/types.js"
import { sql } from "../../db/client.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:request_human_handoff" })

// Tool the AI calls inline when it decides a conversation needs a human.
// Flips the conversation to 'human' mode (if the agent has the toggle on)
// and stamps the reason + timestamp so the operator can triage quickly
// in the dashboard.
export const REQUEST_HUMAN_HANDOFF_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "request_human_handoff",
    description: "Flag this conversation for human takeover and pause yourself. Use ONLY when one of these is true:\n" +
      "- The customer explicitly asks to speak to a human, manager, or real person\n" +
      "- The customer is frustrated or repeating the same question more than twice without progress\n" +
      "- The question is outside what you can answer reliably (refunds, complaints, legal, custom quotes, partnerships, or anything sensitive that requires judgement)\n" +
      "- You've answered the same question more than twice without progress\n" +
      "DO NOT call this for routine questions you can answer from your system prompt, products, or knowledge base. Try those first. After calling this tool, send a single short message letting the customer know a human will follow up.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "A one-sentence summary of why handoff is needed. Operators read this to triage. Be specific (e.g. 'Customer asking for a refund on order #1234' not 'Needs help').",
        },
        urgency: {
          type: "string",
          enum: ["normal", "high"],
          description: "Set 'high' when the customer is angry, complaining, or threatening to leave a negative review. Otherwise 'normal'.",
        },
      },
      required: ["reason"],
    },
  },
}

export async function executeRequestHumanHandoff(
  args: Record<string, unknown>,
  opts: { agentId: string; conversationId: string }
): Promise<string> {
  const reason = typeof args.reason === "string" ? args.reason.slice(0, 500) : null
  const urgency = args.urgency === "high" ? "high" : "normal"
  if (!reason) return JSON.stringify({ error: "reason is required" })

  // Check the agent's pause-on-AI-handoff toggle. If off, we still record
  // the reason for dashboard surfacing but don't flip the mode.
  const agentRows = await sql<{ pauseOnAiHandoff: boolean }[]>`
    SELECT "pauseOnAiHandoff" FROM "Agent" WHERE "id" = ${opts.agentId} LIMIT 1
  `
  const shouldPause = agentRows[0]?.pauseOnAiHandoff ?? true

  await sql`
    UPDATE "Conversation"
    SET "handoffReason"  = ${reason},
        "handoffUrgency" = ${urgency},
        "handoffAt"      = NOW()
        ${shouldPause ? sql`, "mode" = 'human'` : sql``}
    WHERE "id" = ${opts.conversationId}
  `

  logger.info(
    { conversationId: opts.conversationId, agentId: opts.agentId, urgency, paused: shouldPause },
    "Handoff requested by AI"
  )
  return JSON.stringify({
    success: true,
    pausedAi: shouldPause,
    message: shouldPause
      ? "Conversation has been paused for human follow-up. Send a brief acknowledgement to the customer."
      : "Handoff flagged for the operator dashboard, but you can keep replying. Send a brief acknowledgement.",
  })
}
