import type { ToolDefinition } from "../../providers/types.js"
import { listAgentLabels, getChatStageLabelIds } from "../../db/queries/labels.js"
import { dispatchLabel } from "../../orchestrator/response-dispatcher.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:tag_conversation" })

export const TAG_CONVERSATION_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "tag_conversation",
    description:
      "Categorise THIS chat by applying one of the business's WhatsApp labels (the ones listed under " +
      "'## Available labels' in your system prompt). Apply a label when the conversation clearly matches its " +
      "meaning — e.g. a customer who has agreed to buy but hasn't paid → the 'pending payment' label; a paid " +
      "order → the 'paid' label. STAGE labels form a funnel: only one applies at a time and this tool swaps it " +
      "automatically as the situation changes. TAG labels are additive and stack. Only tag on a CLEAR change in " +
      "the customer's situation, and do NOT re-apply a label the chat already has. Pass label_id exactly as listed.",
    parameters: {
      type: "object",
      properties: {
        label_id: {
          type: "string",
          description: "The id of the label to apply — MUST be one from the '## Available labels' list.",
        },
      },
      required: ["label_id"],
    },
  },
}

export async function executeTagConversation(
  args: Record<string, unknown>,
  opts: { agentId: string; conversationId: string; toJid: string }
): Promise<string> {
  const labelId = typeof args.label_id === "string" ? args.label_id : ""
  if (!labelId) return JSON.stringify({ error: "label_id is required" })
  if (!opts.toJid) return JSON.stringify({ error: "No chat is available to tag in this context." })

  const labels = await listAgentLabels(opts.agentId)
  const label = labels.find((l) => l.waLabelId === labelId)
  if (!label) {
    return JSON.stringify({
      error: `Label '${labelId}' isn't in your label list. Only use a label_id from '## Available labels'.`,
    })
  }

  try {
    // MIX rule: a stage label replaces the chat's other stage labels (one active
    // at a time); an additive tag just gets added alongside.
    if (label.isStage) {
      const current = await getChatStageLabelIds(opts.agentId, opts.toJid)
      for (const other of current) {
        if (other === labelId) continue
        await dispatchLabel({ agentId: opts.agentId, toJid: opts.toJid, waLabelId: other, action: "remove" })
          .catch((err) => logger.warn({ err, other }, "stage label swap — remove failed (continuing)"))
      }
    }

    await dispatchLabel({ agentId: opts.agentId, toJid: opts.toJid, waLabelId: labelId, action: "add", appliedBy: "ai" })
    logger.info({ agentId: opts.agentId, conversationId: opts.conversationId, labelId, isStage: label.isStage }, "tag_conversation applied")
    return JSON.stringify({ success: true, message: `Tagged this chat as "${label.name}".` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ agentId: opts.agentId, labelId, err: message }, "tag_conversation failed")
    return JSON.stringify({ error: `Failed to tag the chat: ${message}` })
  }
}
