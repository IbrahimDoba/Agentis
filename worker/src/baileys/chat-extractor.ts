import { sql } from "../db/client.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "chat-extractor" })

// Reads the most recent N inbound-bearing 1:1 conversations the
// history-sync handler persisted, takes the last K messages from each, and
// writes the normalized dataset to Agent.autoConfigInputs. This is the
// input the A3 LLM call consumes.
//
// Groups, broadcasts, channels, and status JIDs are already excluded
// upstream by history-sync.ts. As a belt-and-suspenders we filter again
// at the SQL level on phoneNumber pattern.

const TOP_CHATS = 50
const MESSAGES_PER_CHAT = 15
// 2 messages = customer said something + (someone replied or said something
// more). Was 4 originally — too strict for re-linked accounts where
// WhatsApp only pushes a small recent slice per chat.
const MIN_MESSAGES_PER_CHAT = 2

export interface ConversationCandidate {
  contactPhone: string
  contactName: string | null
  hadOperatorReply: boolean
  lastMessages: { direction: "inbound" | "outbound"; content: string; ts: string }[]
}

export interface ExtractionSummary {
  candidateCount: number
  totalMessages: number
  status: "ready" | "insufficient_data"
}

export async function extractChatsForAutoConfig(agentId: string): Promise<ExtractionSummary> {
  // Top conversations on this agent by lastActivityAt, excluding any that
  // somehow ended up with a group / channel / broadcast suffix in
  // phoneNumber (defensive; history-sync should have skipped them).
  const conversations = await sql<{
    id: string
    phoneNumber: string
    contactName: string | null
  }[]>`
    SELECT "id", "phoneNumber", "contactName"
    FROM "Conversation"
    WHERE "agentId" = ${agentId}
      AND "channel" = 'whatsapp'
      AND "phoneNumber" NOT LIKE '%@g.us'
      AND "phoneNumber" NOT LIKE '%@broadcast'
      AND "phoneNumber" NOT LIKE '%@newsletter'
      AND "phoneNumber" != ''
    ORDER BY "lastActivityAt" DESC NULLS LAST
    LIMIT ${TOP_CHATS * 2}
  `

  const candidates: ConversationCandidate[] = []

  for (const conv of conversations) {
    if (candidates.length >= TOP_CHATS) break

    const messages = await sql<{
      direction: string
      senderRole: string
      content: string
      createdAt: string
    }[]>`
      SELECT "direction", "senderRole", "content", "createdAt"
      FROM "Message"
      WHERE "conversationId" = ${conv.id}
        AND "content" IS NOT NULL
        AND "content" != ''
      ORDER BY "createdAt" DESC
      LIMIT ${MESSAGES_PER_CHAT}
    `
    if (messages.length < MIN_MESSAGES_PER_CHAT) continue

    const chronological = messages.reverse()
    const hadOperatorReply = chronological.some(
      (m) => m.direction === "outbound" && m.senderRole === "human"
    )

    candidates.push({
      contactPhone: conv.phoneNumber,
      contactName: conv.contactName,
      hadOperatorReply,
      lastMessages: chronological.map((m) => ({
        direction: m.direction === "outbound" ? "outbound" : "inbound",
        content: m.content,
        ts: m.createdAt,
      })),
    })
  }

  const totalMessages = candidates.reduce((acc, c) => acc + c.lastMessages.length, 0)
  // Even 1 candidate is enough to give the LLM something to work from for
  // a basic system prompt — better than nothing. Was 5 originally; that's
  // too strict for re-linked accounts or new businesses just starting.
  const status: ExtractionSummary["status"] =
    candidates.length >= 1 ? "ready" : "insufficient_data"

  // Persist into Agent.autoConfigInputs as a JSONB blob the A3 LLM step
  // reads from. We also bump autoConfigStatus to 'analyzing' so the
  // dashboard / onboarding UI knows we're past the data-extraction phase.
  const inputsJson = JSON.stringify({ candidates, extractedAt: new Date().toISOString() })
  const nextStatus = status === "ready" ? "analyzing" : "failed"
  const failureReason = status === "ready" ? null : "No customer chats found yet — try again once a few real conversations have come in, or set up the agent manually."

  // Split into two simple UPDATEs instead of one with a conditional SQL
  // fragment. The `${cond ? sql\`...\` : sql\`...\`}` pattern doesn't
  // always interpolate correctly under postgres-js, and was throwing 500
  // from the worker route when called the second time.
  await sql`
    UPDATE "Agent"
    SET "autoConfigInputs" = ${inputsJson}::jsonb,
        "autoConfigStatus" = ${nextStatus}
    WHERE "id" = ${agentId}
  `
  if (failureReason) {
    await sql`
      UPDATE "Agent"
      SET "autoConfigDraft" = jsonb_build_object('error', ${failureReason}::text)
      WHERE "id" = ${agentId}
    `
  }

  logger.info(
    { agentId, candidateCount: candidates.length, totalMessages, status },
    "Chat extraction complete"
  )

  return { candidateCount: candidates.length, totalMessages, status }
}
