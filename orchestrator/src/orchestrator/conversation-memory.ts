import OpenAI from "openai"
import { config } from "../config.js"
import { sql } from "../db/client.js"
import { logger as rootLogger } from "../lib/logger.js"
import { olderThanWindow, needsRefresh, formatTranscript } from "./conversation-memory-window.js"

const logger = rootLogger.child({ module: "conversation-memory" })

const SUMMARY_MODEL = "gpt-4o-mini"
// Re-summarise once this many messages have fallen out of the short-term window
// since the last pass. Low enough that the record stays current, high enough
// that a busy chat doesn't pay for a summary on every turn.
const REFRESH_EVERY = 8
// Hard cap on how much history one summarisation pass reads, so an outlier
// thread (one here runs to 565 messages) can't blow up the call.
const MAX_HISTORY = 250

// A durable record of the things that get lost when older messages fall out of
// the short-term window. Deliberately a FACT SHEET, not prose: the failures this
// fixes are all "you already told me" — the delivery address, the size, the
// price that was quoted — and a narrative summary buries exactly those.
const SUMMARY_SYSTEM_PROMPT = `You maintain the running record of a WhatsApp sales conversation for a business.

You are given the earlier part of a conversation. Extract ONLY what is still true and still useful, as short labelled lines. This record is shown to the sales agent later, when these older messages are no longer visible to it.

Output these lines, and ONLY those that are actually known — skip any line you have no information for. Never guess.

Customer name:
Location:
Product(s) discussed:
Size:
Price quoted:
Delivery quoted:
Payment status:
Promised by the business:
Still open:

Rules:
- Facts only, exactly as stated in the conversation. Never invent or infer a value.
- Quote prices and fees exactly as they were said (e.g. "32k", "₦5,000").
- "Promised by the business" = commitments a human or the agent made (restock dates, callbacks, dispatch timing).
- "Still open" = the unresolved question or the next step.
- If the customer corrected something, record the CORRECTED value only.
- No preamble, no markdown, no bullets. Just the labelled lines.`

export interface ConversationMemory {
  summary: string
  messagesCovered: number
}

/** The stored record for a conversation, or null when there isn't one yet. */
export async function loadConversationMemory(conversationId: string): Promise<ConversationMemory | null> {
  const rows = await sql<{ summary: string; messagesCovered: number }[]>`
    SELECT "summary", "messagesCovered"
    FROM "ConversationSummary"
    WHERE "conversationId" = ${conversationId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row?.summary?.trim()) return null
  return { summary: row.summary, messagesCovered: row.messagesCovered }
}

/**
 * Refresh the record if enough history has aged out of the short-term window.
 *
 * Only messages OLDER than the window are summarised: the recent ones are still
 * shown to the model verbatim, so including them would duplicate context and let
 * a lossy summary override the exact wording. Respects the same `deletedAt`
 * memory cutoff as getRecentMessages — a cleared conversation must not come back
 * to life through the summary.
 *
 * Best-effort: never throws. A failed refresh leaves the previous record in
 * place, which is stale but still better than nothing.
 */
export async function refreshConversationMemory(
  conversationId: string,
  shortTermWindow: number
): Promise<void> {
  try {
    const rows = await sql<{ id: string; direction: string; senderRole: string; content: string; createdAt: Date }[]>`
      SELECT m."id", m."direction", m."senderRole", m."content", m."createdAt"
      FROM "Message" m
      JOIN "Conversation" c ON c."id" = m."conversationId"
      WHERE m."conversationId" = ${conversationId}
        AND m."createdAt" > COALESCE(c."deletedAt", '-infinity'::timestamptz)
      ORDER BY m."createdAt" ASC, m."id" ASC
    `
    // Everything the model can still see verbatim is excluded.
    const older = rows.slice(0, olderThanWindow(rows.length, shortTermWindow))
    if (older.length === 0) return

    const existing = await loadConversationMemory(conversationId)
    if (!needsRefresh(older.length, existing?.messagesCovered ?? 0, REFRESH_EVERY)) return

    const history = formatTranscript(older.slice(-MAX_HISTORY))

    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY })
    const res = await client.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: history },
      ],
      temperature: 0,
      max_tokens: 400,
    })
    const summary = res.choices[0]?.message?.content?.trim()
    if (!summary) return

    const lastId = older[older.length - 1].id
    await sql`
      INSERT INTO "ConversationSummary" ("conversationId", "summary", "messagesCovered", "summarizedThroughMessageId", "updatedAt")
      VALUES (${conversationId}, ${summary}, ${older.length}, ${lastId}, NOW())
      ON CONFLICT ("conversationId") DO UPDATE
      SET "summary" = EXCLUDED."summary",
          "messagesCovered" = EXCLUDED."messagesCovered",
          "summarizedThroughMessageId" = EXCLUDED."summarizedThroughMessageId",
          "updatedAt" = NOW()
    `
    logger.info({ conversationId, messagesCovered: older.length }, "Conversation memory refreshed")
  } catch (err: any) {
    logger.warn({ conversationId, err: err?.message }, "Conversation memory refresh failed — keeping previous record")
  }
}
