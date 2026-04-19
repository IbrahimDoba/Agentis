import { randomUUID } from "crypto"
import { sql } from "../client.js"

export interface Conversation {
  id: string
  agentId: string
  orchestratorAgentId: string | null
  phoneNumber: string
  mode: "ai" | "human"
  lastActivityAt: string | null
}

export interface Message {
  id: string
  conversationId: string
  direction: "inbound" | "outbound"
  content: string
  mediaUrl: string | null
  mediaDescription: string | null
  toolCalls: unknown | null
  tokensInput: number | null
  tokensOutput: number | null
  modelUsed: string | null
  createdAt: string
}

export async function getOrCreateConversation(
  agentId: string,
  phoneNumber: string,
  orchestratorAgentId: string | null
): Promise<Conversation> {
  // Try to find existing
  const existing = await sql<Conversation[]>`
    SELECT "id", "agentId", "orchestratorAgentId", "phoneNumber", "mode", "lastActivityAt"
    FROM "Conversation"
    WHERE "agentId" = ${agentId} AND "phoneNumber" = ${phoneNumber}
    LIMIT 1
  `
  if (existing[0]) {
    await sql`
      UPDATE "Conversation"
      SET "lastActivityAt" = NOW(), "orchestratorAgentId" = COALESCE(${orchestratorAgentId}, "orchestratorAgentId")
      WHERE "id" = ${existing[0].id}
    `
    return { ...existing[0], orchestratorAgentId: orchestratorAgentId ?? existing[0].orchestratorAgentId }
  }

  // Create new
  const id = randomUUID()
  const rows = await sql<Conversation[]>`
    INSERT INTO "Conversation" ("id", "agentId", "orchestratorAgentId", "phoneNumber", "mode", "lastActivityAt", "createdAt")
    VALUES (${id}, ${agentId}, ${orchestratorAgentId}, ${phoneNumber}, 'ai', NOW(), NOW())
    RETURNING "id", "agentId", "orchestratorAgentId", "phoneNumber", "mode", "lastActivityAt"
  `
  return rows[0]
}

export async function insertMessage(msg: {
  conversationId: string
  direction: "inbound" | "outbound"
  content: string
  mediaUrl?: string | null
  mediaDescription?: string | null
  toolCalls?: unknown
  tokensInput?: number
  tokensOutput?: number
  modelUsed?: string
}): Promise<string> {
  const id = randomUUID()
  await sql`
    INSERT INTO "Message" ("id", "conversationId", "direction", "content",
      "mediaUrl", "mediaDescription", "toolCalls",
      "tokensInput", "tokensOutput", "modelUsed", "createdAt")
    VALUES (
      ${id}, ${msg.conversationId}, ${msg.direction}, ${msg.content},
      ${msg.mediaUrl ?? null}, ${msg.mediaDescription ?? null},
      ${msg.toolCalls ? JSON.stringify(msg.toolCalls) : null},
      ${msg.tokensInput ?? null}, ${msg.tokensOutput ?? null},
      ${msg.modelUsed ?? null}, NOW()
    )
  `
  return id
}

export async function getRecentMessages(
  conversationId: string,
  limit: number
): Promise<Message[]> {
  const rows = await sql<Message[]>`
    SELECT "id", "conversationId", "direction", "content",
           "mediaUrl", "mediaDescription", "toolCalls",
           "tokensInput", "tokensOutput", "modelUsed", "createdAt"
    FROM "Message"
    WHERE "conversationId" = ${conversationId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `
  // Return in chronological order (oldest first)
  return rows.reverse()
}

export async function getConversationMessageCount(conversationId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text as count FROM "Message"
    WHERE "conversationId" = ${conversationId}
  `
  return parseInt(rows[0]?.count ?? "0", 10)
}
