import { sql } from "./client.js"
import { randomUUID } from "crypto"

export type BaileysStatus =
  | "DISCONNECTED"
  | "QR_PENDING"
  | "CONNECTING"
  | "CONNECTED"
  | "LOGGED_OUT"
  | "BANNED"

export interface BaileysSession {
  id: string
  agentId: string
  phoneNumber: string | null
  status: BaileysStatus
  warmupTier: number
  warmupStartedAt: string | null
  dailyMessageCount: number
  dailyCountResetAt: string
  lastConnectedAt: string | null
  lastDisconnectReason: string | null
  linkedDeviceName: string
  authBackupPath: string | null
  businessHoursStart: string
  businessHoursEnd: string
  timezone: string
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  elevenlabsAgentId: string | null
  transportType: string
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessionByAgentId(agentId: string): Promise<BaileysSession | null> {
  const rows = await sql<BaileysSession[]>`
    SELECT * FROM "BaileysSession" WHERE "agentId" = ${agentId} LIMIT 1
  `
  return rows[0] ?? null
}

export async function upsertSession(
  agentId: string,
  fields: Partial<Omit<BaileysSession, "id" | "agentId" | "createdAt">>
): Promise<BaileysSession> {
  const now = new Date().toISOString()
  const id = randomUUID()
  const rows = await sql<BaileysSession[]>`
    INSERT INTO "BaileysSession" ("id", "agentId", "status", "warmupTier", "dailyMessageCount",
      "dailyCountResetAt", "linkedDeviceName", "businessHoursStart", "businessHoursEnd",
      "timezone", "createdAt", "updatedAt",
      "phoneNumber", "warmupStartedAt", "lastConnectedAt", "lastDisconnectReason", "authBackupPath")
    VALUES (
      ${id}, ${agentId},
      ${(fields.status ?? "DISCONNECTED") as string},
      ${fields.warmupTier ?? 1},
      ${fields.dailyMessageCount ?? 0},
      ${fields.dailyCountResetAt ?? now},
      ${fields.linkedDeviceName ?? "Dailzero AI"},
      ${fields.businessHoursStart ?? "08:00"},
      ${fields.businessHoursEnd ?? "21:00"},
      ${fields.timezone ?? "Africa/Lagos"},
      ${now}, ${now},
      ${fields.phoneNumber ?? null},
      ${fields.warmupStartedAt ?? null},
      ${fields.lastConnectedAt ?? null},
      ${fields.lastDisconnectReason ?? null},
      ${fields.authBackupPath ?? null}
    )
    ON CONFLICT ("agentId") DO UPDATE SET
      "status" = EXCLUDED."status",
      "phoneNumber" = COALESCE(EXCLUDED."phoneNumber", "BaileysSession"."phoneNumber"),
      "warmupTier" = EXCLUDED."warmupTier",
      "dailyMessageCount" = EXCLUDED."dailyMessageCount",
      "updatedAt" = ${now}
    RETURNING *
  `
  return rows[0]
}

export async function updateSessionStatus(
  agentId: string,
  status: BaileysStatus,
  extra?: Partial<BaileysSession>
): Promise<void> {
  const now = new Date().toISOString()
  await sql`
    UPDATE "BaileysSession" SET
      "status" = ${status as string},
      "phoneNumber" = COALESCE(${extra?.phoneNumber ?? null}, "phoneNumber"),
      "lastConnectedAt" = COALESCE(${extra?.lastConnectedAt ?? null}::timestamptz, "lastConnectedAt"),
      "lastDisconnectReason" = COALESCE(${extra?.lastDisconnectReason ?? null}, "lastDisconnectReason"),
      "warmupStartedAt" = COALESCE(${extra?.warmupStartedAt ?? null}::timestamptz, "warmupStartedAt"),
      "updatedAt" = ${now}
    WHERE "agentId" = ${agentId}
  `
}

export async function deleteSession(agentId: string): Promise<void> {
  await sql`DELETE FROM "BaileysSession" WHERE "agentId" = ${agentId}`
}

// ── Outbound log ──────────────────────────────────────────────────────────────

export async function logOutbound(entry: {
  sessionId: string
  conversationId?: string
  toJid: string
  messagePreview?: string
  delayAppliedMs?: number
  status: "QUEUED" | "SENT" | "FAILED" | "RATE_LIMITED"
  sentAt?: string
}): Promise<void> {
  await sql`
    INSERT INTO "BaileysOutboundLog"
      ("sessionId", "conversationId", "toJid", "messagePreview", "delayAppliedMs", "status", "sentAt")
    VALUES (
      ${entry.sessionId}, ${entry.conversationId ?? null}, ${entry.toJid},
      ${entry.messagePreview ?? null}, ${entry.delayAppliedMs ?? null},
      ${entry.status}, ${entry.sentAt ?? null}
    )
  `
}

export async function markOutboundSent(id: string, delayAppliedMs: number): Promise<void> {
  await sql`
    UPDATE "BaileysOutboundLog"
    SET "status" = 'SENT', "sentAt" = NOW(), "delayAppliedMs" = ${delayAppliedMs}
    WHERE "id" = ${id}
  `
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export async function getAgent(agentId: string): Promise<Agent | null> {
  const rows = await sql<Agent[]>`
    SELECT "id", "elevenlabsAgentId", "transportType"
    FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  return rows[0] ?? null
}

// ── Customer / conversation lookup ───────────────────────────────────────────

export async function getOrCreateCustomer(phoneNumber: string, agentId: string) {
  const rows = await sql<{ id: string; phoneNumber: string; name: string | null; conversationSummary: string | null }[]>`
    SELECT "id", "phoneNumber", "name", "conversationSummary"
    FROM "Customer"
    WHERE "phoneNumber" = ${phoneNumber} AND "agentId" = ${agentId}
    LIMIT 1
  `
  if (rows[0]) {
    await sql`UPDATE "Customer" SET "lastSeen" = NOW() WHERE "id" = ${rows[0].id}`
    return rows[0]
  }
  const id = randomUUID()
  const created = await sql<{ id: string; phoneNumber: string; name: string | null; conversationSummary: string | null }[]>`
    INSERT INTO "Customer" ("id", "phoneNumber", "agentId", "lastSeen", "createdAt", "updatedAt")
    VALUES (${id}, ${phoneNumber}, ${agentId}, NOW(), NOW(), NOW())
    RETURNING "id", "phoneNumber", "name", "conversationSummary"
  `
  return created[0]
}

export async function getRecentConversationLogs(phoneNumber: string, agentId: string, limit = 10) {
  return sql<{ conversationId: string; summary?: string; durationSecs?: number; startTime?: string; status?: string }[]>`
    SELECT "conversationId", "summary", "durationSecs", "startTime", "status"
    FROM "ConversationLog"
    WHERE "phoneNumber" = ${phoneNumber} AND "agentId" = ${agentId}
    ORDER BY "startTime" DESC
    LIMIT ${limit}
  `
}

export async function upsertConversationLog(entry: {
  conversationId: string
  elevenlabsAgentId: string
  agentId: string
  phoneNumber?: string
  transcript: unknown[]
  summary?: string
  durationSecs?: number
  startTime?: string
  status?: string
  creditsUsed?: number
  rawPayload: unknown
}) {
  await sql`
    INSERT INTO "ConversationLog"
      ("conversationId", "elevenlabsAgentId", "agentId", "phoneNumber", "transcript",
       "summary", "durationSecs", "startTime", "status", "creditsUsed", "rawPayload", "createdAt")
    VALUES (
      ${entry.conversationId}, ${entry.elevenlabsAgentId}, ${entry.agentId},
      ${entry.phoneNumber ?? null}, ${JSON.stringify(entry.transcript)},
      ${entry.summary ?? null}, ${entry.durationSecs ?? null},
      ${entry.startTime ?? null}, ${entry.status ?? null},
      ${entry.creditsUsed ?? 0}, ${JSON.stringify(entry.rawPayload)}, NOW()
    )
    ON CONFLICT ("conversationId") DO UPDATE SET
      "summary" = EXCLUDED."summary",
      "status" = EXCLUDED."status",
      "creditsUsed" = EXCLUDED."creditsUsed"
  `
}
