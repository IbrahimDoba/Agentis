import { sql } from "../client.js"
import type { StatusKind } from "../../baileys/status-post.js"

export type StatusPostStatus = "scheduled" | "posting" | "posted" | "failed" | "cancelled" | "deleting" | "deleted"

export interface StatusPost {
  id: string
  agentId: string
  kind: StatusKind
  text: string | null
  backgroundColor: string | null
  font: number | null
  mediaItemId: string | null
  aiNote: string | null
  status: StatusPostStatus
  scheduledAt: Date
  postedAt: Date | null
  waMessageId: string | null
  recipientCount: number
}

export async function getStatusPost(id: string): Promise<StatusPost | null> {
  const [row] = await sql<StatusPost[]>`SELECT * FROM "StatusPost" WHERE "id" = ${id} LIMIT 1`
  return row ?? null
}

// Guarded on the current status so a post the owner cancelled a moment ago, or
// a duplicate job, can never be posted.
export async function setStatusPostStatus(id: string, from: StatusPostStatus[], to: StatusPostStatus, error: string | null = null): Promise<boolean> {
  const rows = await sql`
    UPDATE "StatusPost" SET "status" = ${to}, "error" = ${error}, "updatedAt" = now()
    WHERE "id" = ${id} AND "status" IN ${sql(from)}
    RETURNING "id"
  `
  return rows.length > 0
}

export async function markStatusPosted(id: string, waMessageId: string, recipientCount: number, creditsUsed: number): Promise<void> {
  await sql`
    UPDATE "StatusPost"
    SET "status" = 'posted', "waMessageId" = ${waMessageId}, "recipientCount" = ${recipientCount},
        "creditsUsed" = ${creditsUsed}, "postedAt" = now(), "error" = NULL, "updatedAt" = now()
    WHERE "id" = ${id} AND "status" = 'posting'
  `
}

export async function listScheduledStatusPosts(): Promise<Array<Pick<StatusPost, "id" | "agentId" | "scheduledAt">>> {
  return sql`SELECT "id", "agentId", "scheduledAt" FROM "StatusPost" WHERE "status" = 'scheduled'`
}

// A restart mid-send leaves no way to tell whether WhatsApp got the post, so it
// is failed rather than retried: a duplicate status is worse than a missing one.
export async function settleInterruptedStatusPosts(): Promise<{ failed: number; restored: number }> {
  const failed = await sql`
    UPDATE "StatusPost" SET "status" = 'failed', "error" = 'Interrupted by a restart. Post it again if it isn''t on your status.', "updatedAt" = now()
    WHERE "status" = 'posting' RETURNING "id"
  `
  const restored = await sql`
    UPDATE "StatusPost" SET "status" = 'posted', "updatedAt" = now() WHERE "status" = 'deleting' RETURNING "id"
  `
  return { failed: failed.length, restored: restored.length }
}

// Customers the owner has chatted with come first, so a plan cap trims the
// address book's long tail rather than the people most likely to reply.
export async function listStatusAudience(agentId: string): Promise<string[]> {
  const rows = await sql<{ phone: string }[]>`
    SELECT w."phone" FROM "WhatsAppContact" w
    WHERE w."agentId" = ${agentId}
    ORDER BY EXISTS (
      SELECT 1 FROM "Conversation" c WHERE c."agentId" = w."agentId" AND c."phoneNumber" = w."phone"
    ) DESC, w."createdAt" ASC
  `
  return rows.map((r) => r.phone)
}

export async function getStatusNote(agentId: string, waMessageId: string): Promise<string | null> {
  const [row] = await sql<{ aiNote: string | null }[]>`
    SELECT "aiNote" FROM "StatusPost" WHERE "agentId" = ${agentId} AND "waMessageId" = ${waMessageId} LIMIT 1
  `
  return row?.aiNote ?? null
}

export async function getMediaItemForAgent(id: string, agentId: string): Promise<{ r2Key: string; mimeType: string } | null> {
  const [row] = await sql<{ r2Key: string; mimeType: string }[]>`
    SELECT "r2Key", "mimeType" FROM "MediaItem" WHERE "id"::text = ${id} AND "agentId" = ${agentId} LIMIT 1
  `
  return row ?? null
}
