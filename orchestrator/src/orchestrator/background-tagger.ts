import { getRedis } from "../queue/redis.js"
import { resolveProvider } from "../providers/registry.js"
import { listAgentLabels, getChatStageLabelIds } from "../db/queries/labels.js"
import { getRecentMessages } from "../db/queries/conversations.js"
import { applyLabelWithMix } from "./label-apply.js"
import type { ChatMessage } from "../providers/types.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "background-tagger" })

// At most one background classification per conversation per this window.
const THROTTLE_TTL = 120 // seconds

// Cheap pre-filter (no I/O): skip acks / very short messages that rarely move a
// stage. Short messages that mention money/numbers (e.g. "paid 5k") are kept.
function isTrivial(text: string): boolean {
  const t = text.trim()
  return t.length < 12 && !/[0-9₦$]/.test(t)
}

/**
 * Background tagging — runs when a HUMAN is handling the chat (or the AI is
 * globally paused), so no AI reply is generated. It occasionally classifies the
 * conversation and applies/swaps a label without replying.
 *
 * Deliberately cheap, in order:
 *   1. trivial-message filter (no I/O),
 *   2. per-conversation throttle (Redis — one classify per THROTTLE_TTL),
 *   3. "funnel already at its terminal stage" check,
 * and only then a TINY model call (label list + last 4 messages -> one id).
 * No customer-facing send, so it never charges the business's credits.
 */
export async function classifyAndTagInBackground(opts: {
  agentId: string
  model: string
  conversationId: string
  senderJid: string
  latestText: string
}): Promise<void> {
  const { agentId, model, conversationId, senderJid, latestText } = opts
  if (!senderJid || isTrivial(latestText)) return

  // Throttle per conversation — at most one classify per THROTTLE_TTL.
  const redis = getRedis()
  const claimed = await redis.set(`bgtag:throttle:${conversationId}`, "1", "EX", THROTTLE_TTL, "NX")
  if (claimed !== "OK") return

  const labels = await listAgentLabels(agentId)
  if (labels.length === 0) return

  // Stop once the funnel is at its terminal stage — nothing left to advance to.
  const stages = labels.filter((l) => l.isStage)
  if (stages.length > 0) {
    const current = new Set(await getChatStageLabelIds(agentId, senderJid))
    const terminal = stages[stages.length - 1] // labels come sorted by stageOrder asc
    if (current.has(terminal.waLabelId)) return
  }

  const labelList = labels
    .map((l) => `- ${l.waLabelId}: ${l.name}${l.isStage ? " (stage)" : ""}${l.applyRule ? ` — ${l.applyRule}` : ""}`)
    .join("\n")
  const system =
    `Categorise this WhatsApp chat with AT MOST ONE label. Reply with ONLY the label id from the list ` +
    `(exactly as written), or "none" if none clearly applies. No explanation.\n\nLabels:\n${labelList}`

  const recent = await getRecentMessages(conversationId, 4)
  const tail: ChatMessage[] = recent.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content,
  }))
  if (tail.length === 0) return

  try {
    const res = await resolveProvider(model).chat({
      model,
      system,
      messages: tail,
      tools: [],
      temperature: 0,
      max_output_tokens: 16,
    })
    const out = (res.content ?? "").trim().replace(/^["'`]+|["'`]+$/g, "")
    if (!out || out.toLowerCase() === "none") return
    const label = labels.find((l) => l.waLabelId === out)
    if (!label) return
    await applyLabelWithMix(agentId, senderJid, label, "ai")
    logger.info({ agentId, conversationId, labelId: label.waLabelId, isStage: label.isStage }, "background tag applied")
  } catch (err) {
    logger.warn({ agentId, conversationId, err: String(err) }, "background tagging failed")
  }
}
