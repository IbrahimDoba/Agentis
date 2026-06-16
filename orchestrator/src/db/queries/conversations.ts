import { randomUUID } from "crypto"
import { sql } from "../client.js"

export interface AdContext {
  title: string | null
  body: string | null
  sourceUrl: string | null
  sourceId: string | null
  ctwaClid: string | null
  thumbnailUrl: string | null
  capturedAt: string
}

export interface Conversation {
  id: string
  agentId: string
  orchestratorAgentId: string | null
  phoneNumber: string
  mode: "ai" | "human"
  lastActivityAt: string | null
  adContext: AdContext | null
  channel: "whatsapp" | "embed" | "api"
  visitorId: string | null
}

export interface Message {
  id: string
  conversationId: string
  direction: "inbound" | "outbound"
  senderRole: "ai" | "human"
  content: string
  mediaUrl: string | null
  mediaDescription: string | null
  toolCalls: unknown | null
  tokensInput: number | null
  tokensOutput: number | null
  modelUsed: string | null
  createdAt: string
}

export interface CreateConversationOptions {
  contactName?: string
  defaultMode?: "ai" | "human"
  channel?: "whatsapp" | "embed" | "api"
  visitorId?: string
}

export async function getOrCreateConversation(
  agentId: string,
  phoneNumber: string,
  orchestratorAgentId: string | null,
  contactNameOrOptions?: string | CreateConversationOptions,
  legacyDefaultMode: "ai" | "human" = "ai"
): Promise<Conversation> {
  // Backwards-compatible signature: existing callers pass (agentId, phone,
  // orchAgentId, pushName, mode). New embed caller passes an options bag.
  const opts: CreateConversationOptions =
    typeof contactNameOrOptions === "string" || contactNameOrOptions === undefined
      ? { contactName: contactNameOrOptions, defaultMode: legacyDefaultMode }
      : contactNameOrOptions
  const contactName = opts.contactName
  const defaultMode = opts.defaultMode ?? "ai"
  const channel = opts.channel ?? "whatsapp"
  const visitorId = opts.visitorId ?? null

  // Try to find existing
  const existing = await sql<Conversation[]>`
    SELECT "id", "agentId", "orchestratorAgentId", "phoneNumber", "mode",
           "lastActivityAt", "adContext", "channel", "visitorId"
    FROM "Conversation"
    WHERE "agentId" = ${agentId} AND "phoneNumber" = ${phoneNumber}
    LIMIT 1
  `
  if (existing[0]) {
    await sql`
      UPDATE "Conversation"
      SET "lastActivityAt" = NOW(),
          "orchestratorAgentId" = COALESCE(${orchestratorAgentId}, "orchestratorAgentId"),
          "contactName" = COALESCE(${contactName ?? null}, "contactName")
      WHERE "id" = ${existing[0].id}
    `
    return {
      ...existing[0],
      orchestratorAgentId: orchestratorAgentId ?? existing[0].orchestratorAgentId,
    }
  }

  // Create new
  const id = randomUUID()
  const rows = await sql<Conversation[]>`
    INSERT INTO "Conversation" ("id", "agentId", "orchestratorAgentId", "phoneNumber",
      "contactName", "mode", "channel", "visitorId", "lastActivityAt", "createdAt")
    VALUES (${id}, ${agentId}, ${orchestratorAgentId}, ${phoneNumber},
      ${contactName ?? null}, ${defaultMode}, ${channel}, ${visitorId}, NOW(), NOW())
    RETURNING "id", "agentId", "orchestratorAgentId", "phoneNumber", "mode",
              "lastActivityAt", "adContext", "channel", "visitorId"
  `
  return rows[0]
}

// Persist ad referral context on a conversation the FIRST time it appears.
// Sticky-first: never overwrites an existing value, so a later ad click
// doesn't clobber the original context the AI used to greet the customer.
export async function setConversationAdContextIfEmpty(
  conversationId: string,
  adContext: AdContext
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE "Conversation"
    SET "adContext" = ${JSON.stringify(adContext)}::jsonb
    WHERE "id" = ${conversationId} AND "adContext" IS NULL
    RETURNING "id"
  `
  return rows.length > 0
}

// Atomically CLAIM the one-and-only album send for this conversation. Returns
// true only if the album had not been sent yet (this call won the claim). The
// guard lives in the WHERE clause so concurrent turns — a customer firing several
// messages at once, each processed in parallel — can't all pass a read-then-write
// check and send the album multiple times. The DB serialises the competing
// UPDATEs on the row lock, so exactly one wins.
export async function claimProductAlbumSend(conversationId: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE "Conversation"
    SET "lastProductAlbumSentAt" = now()
    WHERE "id" = ${conversationId} AND "lastProductAlbumSentAt" IS NULL
    RETURNING "id"
  `
  return rows.length > 0
}

// Release a claim made by claimProductAlbumSend when the send itself failed, so a
// retry / later genuine send isn't permanently blocked by a claim that never
// resulted in an album going out.
export async function releaseProductAlbumClaim(conversationId: string): Promise<void> {
  await sql`
    UPDATE "Conversation" SET "lastProductAlbumSentAt" = NULL WHERE "id" = ${conversationId}
  `
}

// Record that the full product album was just sent to this conversation. Used on
// the explicit-resend path (which bypasses the claim) to keep the timestamp set.
export async function markProductAlbumSent(conversationId: string): Promise<void> {
  await sql`
    UPDATE "Conversation" SET "lastProductAlbumSentAt" = now() WHERE "id" = ${conversationId}
  `
}

export async function insertMessage(msg: {
  conversationId: string
  direction: "inbound" | "outbound"
  senderRole?: "ai" | "human"
  content: string
  mediaUrl?: string | null
  mediaDescription?: string | null
  toolCalls?: unknown
  // Structured payload for the widget UI (product cards, etc.) — rendered
  // alongside / in place of the text bubble. Plain WhatsApp dispatch ignores this.
  richContent?: unknown
  tokensInput?: number
  tokensOutput?: number
  modelUsed?: string
  // Optional caller-supplied row id. When provided, we use it instead of
  // generating one. The embed widget uses this to keep its optimistic
  // local-render id in sync with the eventual DB row id so polling doesn't
  // double-render a message the visitor already sees in the UI.
  id?: string
}): Promise<string> {
  const id = msg.id ?? randomUUID()
  const senderRole = msg.senderRole ?? "ai"
  await sql`
    INSERT INTO "Message" ("id", "conversationId", "direction", "senderRole", "content",
      "mediaUrl", "mediaDescription", "toolCalls", "richContent",
      "tokensInput", "tokensOutput", "modelUsed", "createdAt")
    VALUES (
      ${id}, ${msg.conversationId}, ${msg.direction}, ${senderRole}, ${msg.content},
      ${msg.mediaUrl ?? null}, ${msg.mediaDescription ?? null},
      ${msg.toolCalls ? JSON.stringify(msg.toolCalls) : null},
      ${msg.richContent ? JSON.stringify(msg.richContent) : null},
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
