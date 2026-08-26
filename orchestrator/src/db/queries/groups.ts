import { sql } from "../client.js"

export interface GroupChat {
  id: string
  groupJid: string
  subject: string | null
  replyMode: string
  conversationId: string | null
}

export async function getGroupChat(agentId: string, groupJid: string): Promise<GroupChat | null> {
  const rows = await sql<GroupChat[]>`
    SELECT "id", "groupJid", "subject", "replyMode", "conversationId"
    FROM "GroupChat"
    WHERE "agentId" = ${agentId} AND "groupJid" = ${groupJid}
    LIMIT 1
  `
  return rows[0] ?? null
}

/**
 * Attach the conversation carrying this group's thread. Guarded with
 * `IS NULL` so a concurrent inbound can't repoint an already-linked group at a
 * second conversation — the first writer wins and the rest are no-ops.
 */
export async function linkGroupConversation(
  agentId: string,
  groupJid: string,
  conversationId: string
): Promise<void> {
  await sql`
    UPDATE "GroupChat"
    SET "conversationId" = ${conversationId}
    WHERE "agentId" = ${agentId} AND "groupJid" = ${groupJid} AND "conversationId" IS NULL
  `
}
