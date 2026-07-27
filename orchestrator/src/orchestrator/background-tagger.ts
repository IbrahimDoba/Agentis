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

// WhatsApp chat FILTERS ("Unread", "Groups", "Favourites", "Broadcast Lists")
// sync in as labels but are organisational, not sales/CRM tags — never let the
// AI apply them. Matched case-insensitively by name.
const NON_TAGGABLE_LABEL_NAMES = new Set([
  "unread",
  "groups",
  "favourites",
  "favorites",
  "broadcast lists",
  "broadcast",
])

// Cheap pre-filter (no I/O): skip acks / very short messages that rarely move a
// stage. Short messages that mention money/numbers (e.g. "paid 5k") are kept.
function isTrivial(text: string): boolean {
  const t = text.trim()
  return t.length < 12 && !/[0-9₦$]/.test(t)
}

/**
 * Classify-only tagging — runs on every inbound message (after any AI reply is
 * dispatched, or on the no-reply branches when a human handles the chat / the AI
 * is paused). It classifies the conversation and applies/swaps a label without
 * replying, so it's the reliable tagger — unlike the in-reply tag_conversation
 * tool, which only fires when the model volunteers it.
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

  const labels = (await listAgentLabels(agentId)).filter(
    (l) => !NON_TAGGABLE_LABEL_NAMES.has(l.name.trim().toLowerCase())
  )
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
    `You label WhatsApp sales chats, and you are STRICT. Most chats should get NO label. ` +
    `Only output a label id when the conversation CLEARLY and SPECIFICALLY satisfies that label's rule below — ` +
    `a general inquiry, price question, greeting, or someone just browsing is NOT enough. ` +
    `When in any doubt, reply "none".\n\n` +
    `Reply with ONLY the label id (exactly as written) or "none". No explanation.\n\nLabels:\n${labelList}`

  // Use a wider window than a single turn so the rule can be judged against the
  // actual funnel state (e.g. a quote + delivery total + account details were
  // already shared), not just the latest one-liner.
  const recent = await getRecentMessages(conversationId, 8)
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
