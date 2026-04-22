import { sql } from "../client.js"
import { randomUUID } from "crypto"

export type BroadcastStatus = "pending" | "running" | "paused" | "completed" | "cancelled" | "failed"
export type RecipientStatus = "pending" | "sent" | "failed" | "skipped"

export interface BroadcastCampaign {
  id: string
  agentId: string
  message: string
  status: BroadcastStatus
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface BroadcastRecipient {
  id: string
  broadcastId: string
  phoneNumber: string
  jid: string
  contactName: string | null
  status: RecipientStatus
  error: string | null
  sentAt: string | null
}

export interface ResolvedBroadcastRecipient {
  phoneNumber: string
  jid: string
  contactName: string | null
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "")
}

export async function createBroadcast(
  agentId: string,
  message: string,
  recipients: { phoneNumber: string; jid: string; contactName: string | null }[]
): Promise<BroadcastCampaign> {
  const id = randomUUID()

  const rows = await sql<BroadcastCampaign[]>`
    INSERT INTO "BroadcastCampaign" ("id", "agentId", "message", "status", "totalCount", "sentCount", "failedCount", "createdAt")
    VALUES (${id}, ${agentId}, ${message}, 'pending', ${recipients.length}, 0, 0, NOW())
    RETURNING *
  `
  const campaign = rows[0]

  if (recipients.length > 0) {
    for (const r of recipients) {
      await sql`
        INSERT INTO "BroadcastRecipient" ("id", "broadcastId", "phoneNumber", "jid", "contactName", "status")
        VALUES (${randomUUID()}, ${id}, ${r.phoneNumber}, ${r.jid}, ${r.contactName ?? null}, 'pending')
      `
    }
  }

  return campaign
}

export async function resolveBroadcastRecipients(
  agentId: string,
  phoneNumbers: string[]
): Promise<ResolvedBroadcastRecipient[]> {
  const wanted = new Set(
    phoneNumbers.map(normalizePhone).filter((value) => value.length >= 7)
  )
  if (wanted.size === 0) return []

  const [conversations, customers, logs] = await Promise.all([
    sql<{ phoneNumber: string; contactName: string | null; lastActivityAt: string | null; createdAt: string }[]>`
      SELECT "phoneNumber", "contactName", "lastActivityAt", "createdAt"
      FROM "Conversation"
      WHERE "agentId" = ${agentId}
    `,
    sql<{ phoneNumber: string; name: string | null; lastSeen: string }[]>`
      SELECT "phoneNumber", "name", "lastSeen"
      FROM "Customer"
      WHERE "agentId" = ${agentId}
    `,
    sql<{ phoneNumber: string; createdAt: string; startTime: string | null }[]>`
      SELECT "phoneNumber", "createdAt", "startTime"
      FROM "ConversationLog"
      WHERE "agentId" = ${agentId} AND "phoneNumber" IS NOT NULL
    `,
  ])

  const merged = new Map<string, { phoneNumber: string; contactName: string | null; lastActiveAt: number }>()

  const upsert = (rawPhone: string | null | undefined, contactName: string | null, lastActiveValue: string | null | undefined) => {
    if (!rawPhone) return
    const normalized = normalizePhone(rawPhone)
    if (!wanted.has(normalized)) return

    const nextLastActive = lastActiveValue ? new Date(lastActiveValue).getTime() : 0
    const existing = merged.get(normalized)

    if (!existing || nextLastActive >= existing.lastActiveAt) {
      merged.set(normalized, {
        phoneNumber: normalized,
        contactName: contactName?.trim() || existing?.contactName || null,
        lastActiveAt: nextLastActive,
      })
      return
    }

    if (!existing.contactName && contactName?.trim()) {
      existing.contactName = contactName.trim()
    }
  }

  for (const row of conversations) {
    upsert(row.phoneNumber, row.contactName, row.lastActivityAt ?? row.createdAt)
  }

  for (const row of customers) {
    upsert(row.phoneNumber, row.name, row.lastSeen)
  }

  for (const row of logs) {
    upsert(row.phoneNumber, null, row.startTime ?? row.createdAt)
  }

  return Array.from(merged.values())
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .map((row) => ({
      phoneNumber: row.phoneNumber,
      jid: `${row.phoneNumber}@s.whatsapp.net`,
      contactName: row.contactName,
    }))
}

export async function getBroadcast(id: string): Promise<BroadcastCampaign | null> {
  const rows = await sql<BroadcastCampaign[]>`
    SELECT * FROM "BroadcastCampaign" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ?? null
}

export async function listBroadcastRecipients(broadcastId: string): Promise<BroadcastRecipient[]> {
  return sql<BroadcastRecipient[]>`
    SELECT *
    FROM "BroadcastRecipient"
    WHERE "broadcastId" = ${broadcastId}
    ORDER BY "id" ASC
  `
}

export async function listBroadcasts(agentId: string): Promise<BroadcastCampaign[]> {
  return sql<BroadcastCampaign[]>`
    SELECT * FROM "BroadcastCampaign"
    WHERE "agentId" = ${agentId}
    ORDER BY "createdAt" DESC
    LIMIT 50
  `
}

export async function updateBroadcastStatus(
  id: string,
  status: BroadcastStatus,
  extra?: { completedAt?: boolean; startedAt?: boolean }
): Promise<void> {
  await sql`
    UPDATE "BroadcastCampaign"
    SET
      "status" = ${status},
      "startedAt"   = CASE WHEN ${extra?.startedAt ?? false} THEN NOW() ELSE "startedAt" END,
      "completedAt" = CASE WHEN ${extra?.completedAt ?? false} THEN NOW() ELSE "completedAt" END
    WHERE "id" = ${id}
  `
}

export async function incrementBroadcastSent(id: string): Promise<void> {
  await sql`
    UPDATE "BroadcastCampaign" SET "sentCount" = "sentCount" + 1 WHERE "id" = ${id}
  `
}

export async function incrementBroadcastFailed(id: string): Promise<void> {
  await sql`
    UPDATE "BroadcastCampaign" SET "failedCount" = "failedCount" + 1 WHERE "id" = ${id}
  `
}

export async function getPendingRecipients(broadcastId: string): Promise<BroadcastRecipient[]> {
  return sql<BroadcastRecipient[]>`
    SELECT * FROM "BroadcastRecipient"
    WHERE "broadcastId" = ${broadcastId} AND "status" = 'pending'
    ORDER BY "id" ASC
  `
}

export async function updateRecipientStatus(
  id: string,
  status: RecipientStatus,
  error?: string
): Promise<void> {
  await sql`
    UPDATE "BroadcastRecipient"
    SET
      "status" = ${status},
      "error"  = ${error ?? null},
      "sentAt" = CASE WHEN ${status === "sent"} THEN NOW() ELSE "sentAt" END
    WHERE "id" = ${id}
  `
}
