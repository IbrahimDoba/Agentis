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

export interface AgentBillingInfo {
  id: string
  plan: string
  subscriptionExpiresAt: string | null
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
      "warmupTier" = COALESCE(${extra?.warmupTier != null ? extra.warmupTier : null}::int, "warmupTier"),
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

export async function getAgentBillingInfo(agentId: string): Promise<AgentBillingInfo | null> {
  const rows = await sql<AgentBillingInfo[]>`
    SELECT a."id", COALESCE(u."plan", 'free') as "plan", u."subscriptionExpiresAt"
    FROM "Agent" a
    JOIN "User" u ON u."id" = a."userId"
    WHERE a."id" = ${agentId}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getMonthlyCreditsUsed(agentId: string, monthStart: Date, monthEnd: Date): Promise<number> {
  const rows = await sql<{ total: number | null }[]>`
    SELECT COALESCE(SUM("creditsUsed"), 0)::int as total
    FROM "CreditUsage"
    WHERE "agentId" = ${agentId}
      AND "createdAt" >= ${monthStart.toISOString()}::timestamptz
      AND "createdAt" < ${monthEnd.toISOString()}::timestamptz
  `
  return Number(rows[0]?.total ?? 0)
}

export async function insertCreditUsage(entry: {
  agentId: string
  conversationId?: string
  messageType: "text" | "image"
  source?: "ai" | "human"
  creditsUsed: number
}): Promise<void> {
  await sql`
    INSERT INTO "CreditUsage"
      ("agentId", "conversationId", "messageType", "source", "creditsUsed", "createdAt")
    VALUES (
      ${entry.agentId},
      ${entry.conversationId ?? null},
      ${entry.messageType},
      ${entry.source ?? "ai"},
      ${entry.creditsUsed},
      NOW()
    )
  `
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
