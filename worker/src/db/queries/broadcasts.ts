import { sql } from "../client.js"
import { randomUUID } from "crypto"
import { findOrCreateWhatsAppConversation } from "../queries.js"

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
  spreadHours: number | null
  // "whatsapp" = paired Baileys number, free-form text. "meta" = Cloud API,
  // which requires an approved template outside the 24-hour window.
  channel: string
  metaPhoneNumberId: string | null
  templateName: string | null
  templateLanguage: string | null
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
  recipients: { phoneNumber: string; jid: string; contactName: string | null }[],
  spreadHours: number | null = null,
  // Cloud API campaigns carry the number to send from and the approved template
  // to send; Baileys campaigns leave these null and send `message` as text.
  meta?: {
    metaPhoneNumberId: string
    templateName: string
    templateLanguage: string
  } | null
): Promise<BroadcastCampaign> {
  const id = randomUUID()
  const channel = meta ? "meta" : "whatsapp"

  const rows = await sql<BroadcastCampaign[]>`
    INSERT INTO "BroadcastCampaign" ("id", "agentId", "message", "status", "totalCount",
      "sentCount", "failedCount", "spreadHours", "channel", "metaPhoneNumberId",
      "templateName", "templateLanguage", "createdAt")
    VALUES (${id}, ${agentId}, ${message}, 'pending', ${recipients.length}, 0, 0,
      ${spreadHours}, ${channel}, ${meta?.metaPhoneNumberId ?? null},
      ${meta?.templateName ?? null}, ${meta?.templateLanguage ?? null}, NOW())
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

export async function getRecipient(id: string): Promise<BroadcastRecipient | null> {
  const rows = await sql<BroadcastRecipient[]>`
    SELECT * FROM "BroadcastRecipient" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ?? null
}

// On resume, recover recipients that got parked while the broadcast was
// stalled/paused so they re-enqueue (getPendingRecipients only sees 'pending').
export async function resetSkippedToPending(broadcastId: string): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE "BroadcastRecipient"
    SET "status" = 'pending', "error" = NULL
    WHERE "broadcastId" = ${broadcastId} AND "status" = 'skipped'
    RETURNING "id"
  `
  return rows.length
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

// Persist a broadcast message into the recipient's conversation so it shows in
// the dashboard inbox. Deliberately UNLIKE saveHumanOutboundMessage: a broadcast
// is automated outreach, so this must NOT flip the conversation to human mode —
// the AI should still handle any reply. Creates the conversation in 'ai' mode if
// it's new; otherwise appends the message and bumps activity, leaving mode (and
// an existing contactName) untouched. Best-effort — callers must not let a
// failure here fail the actual WhatsApp send.
export async function saveBroadcastOutboundMessage(
  agentId: string,
  phoneNumber: string,
  contactName: string | null,
  text: string
): Promise<void> {
  const conversationId = await findOrCreateWhatsAppConversation({
    agentId,
    phoneNumber,
    contactName,
  })
  if (!conversationId) return
  await sql`
    INSERT INTO "Message" ("id", "conversationId", "direction", "senderRole", "content", "createdAt")
    VALUES (${randomUUID()}, ${conversationId}, 'outbound', 'human', ${text}, NOW())
  `
}
