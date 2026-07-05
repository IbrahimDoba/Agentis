import { sql } from "./client.js"
import { randomUUID } from "crypto"
import { logger as rootLogger } from "../lib/logger.js"
import { cachedTtl, invalidateTtl } from "../lib/ttl-cache.js"

const logger = rootLogger.child({ module: "queries" })

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
  userId: string
  plan: string
  subscriptionExpiresAt: string | null
  carryoverCredits: number
  carryoverExpiresAt: string | null
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessionByAgentId(agentId: string): Promise<BaileysSession | null> {
  const rows = await sql<BaileysSession[]>`
    SELECT * FROM "BaileysSession" WHERE "agentId" = ${agentId} LIMIT 1
  `
  return rows[0] ?? null
}

// Sessions that gave up auto-reconnecting (hit the attempt cap) and are sitting
// DISCONNECTED. The watchdog revives these. The reason filter excludes
// intentionally-disconnected, logged-out (401) and banned (403) sessions —
// those need a deliberate action / fresh QR, not an auto-restart.
export async function getStuckSessions(): Promise<{ agentId: string }[]> {
  return sql<{ agentId: string }[]>`
    SELECT "agentId" FROM "BaileysSession"
    WHERE "status" = 'DISCONNECTED'
      AND "lastDisconnectReason" = 'max_reconnect_attempts_exceeded'
  `
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
      "warmupTier" = COALESCE("BaileysSession"."warmupTier", EXCLUDED."warmupTier"),
      "warmupStartedAt" = COALESCE("BaileysSession"."warmupStartedAt", EXCLUDED."warmupStartedAt"),
      "dailyMessageCount" = EXCLUDED."dailyMessageCount",
      "updatedAt" = ${now}
    RETURNING *
  `
  return rows[0]
}

// Debounce duplicate writes. The Baileys lifecycle fires the SAME (status,
// reason) combo many times in a row during a reconnect loop (e.g. CONNECTING
// + CONNECTING + DISCONNECTED + CONNECTING…). Per the prod logs that one path
// burned >12k UPDATEs/day for a handful of flapping agents. We compare each
// incoming write against the previous one per agent and skip identical ones.
//
// Always write when any field that observably changes is being set
// (lastConnectedAt, phoneNumber, warmupTier, warmupStartedAt) — the goal is
// to drop NO-OP writes, not real ones.
interface LastSessionWrite {
  status: BaileysStatus
  lastDisconnectReason: string | null
  phoneNumber: string | null
  warmupTier: number | null
  warmupStartedAt: string | null
}
const lastSessionWrite = new Map<string, LastSessionWrite>()

// Pure decision, extracted for unit testing.
export function shouldSkipSessionStatusWrite(
  prev: LastSessionWrite | undefined,
  next: { status: BaileysStatus; extra?: Partial<BaileysSession> }
): boolean {
  if (!prev) return false
  if (prev.status !== next.status) return false
  const e = next.extra ?? {}
  // Any provided value that differs from prev → write.
  if (e.lastDisconnectReason !== undefined && e.lastDisconnectReason !== prev.lastDisconnectReason) return false
  if (e.phoneNumber !== undefined && e.phoneNumber !== prev.phoneNumber) return false
  if (e.warmupTier !== undefined && e.warmupTier !== prev.warmupTier) return false
  if (e.warmupStartedAt !== undefined && e.warmupStartedAt !== prev.warmupStartedAt) return false
  // lastConnectedAt is "fresh moment of connection" — when provided, always
  // record it (a re-connect to the same status still wants the timestamp).
  if (e.lastConnectedAt !== undefined) return false
  return true
}

export async function updateSessionStatus(
  agentId: string,
  status: BaileysStatus,
  extra?: Partial<BaileysSession>
): Promise<void> {
  if (shouldSkipSessionStatusWrite(lastSessionWrite.get(agentId), { status, extra })) {
    return
  }
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
  // Record what we just wrote so the next call can compare.
  const prev = lastSessionWrite.get(agentId)
  lastSessionWrite.set(agentId, {
    status,
    lastDisconnectReason: extra?.lastDisconnectReason ?? prev?.lastDisconnectReason ?? null,
    phoneNumber: extra?.phoneNumber ?? prev?.phoneNumber ?? null,
    warmupTier: extra?.warmupTier ?? prev?.warmupTier ?? null,
    warmupStartedAt: extra?.warmupStartedAt ?? prev?.warmupStartedAt ?? null,
  })
}

// Test-only: clear the per-agent dedupe state.
export function __resetSessionWriteCacheForTests(): void {
  lastSessionWrite.clear()
}

export async function updateWarmupTier(agentId: string, tier: number): Promise<void> {
  const now = new Date().toISOString()
  await sql`
    UPDATE "BaileysSession" SET
      "warmupTier" = ${tier},
      "warmupStartedAt" = ${now}::timestamptz,
      "updatedAt" = ${now}
    WHERE "agentId" = ${agentId}
  `
}

export async function deleteSession(agentId: string): Promise<void> {
  await sql`DELETE FROM "BaileysSession" WHERE "agentId" = ${agentId}`
}

// ── History sync (admin-gated chat-history-on-link feature) ──────────────────

export interface HistorySyncStatus {
  // True when the agent's owning user has the admin-controlled feature enabled.
  userEnabled: boolean
  // True when this session has already received a history sync — set after
  // the first messaging-history.set finishes. Reconnects skip re-pulling.
  alreadySynced: boolean
}

// Cached: this is called every startSession() (~once per Baileys reconnect)
// and almost never changes between calls. Burned ~1,600 queries/day in prod
// before the cache. 5min TTL; invalidated on markSessionHistorySynced (the
// only field-changing operation that affects the result).
const HISTORY_SYNC_CACHE_TTL_MS = 5 * 60_000
const historySyncCacheKey = (agentId: string) => `historySyncStatus:${agentId}`

export async function getHistorySyncStatus(agentId: string): Promise<HistorySyncStatus> {
  return cachedTtl(historySyncCacheKey(agentId), HISTORY_SYNC_CACHE_TTL_MS, async () => {
    const rows = await sql<{ userEnabled: boolean; historySyncedAt: string | null }[]>`
      SELECT u."historySyncEnabled" as "userEnabled",
             s."historySyncedAt"
      FROM "Agent" a
      JOIN "User" u ON u."id" = a."userId"
      LEFT JOIN "BaileysSession" s ON s."agentId" = a."id"
      WHERE a."id" = ${agentId}
      LIMIT 1
    `
    const r = rows[0]
    if (!r) return { userEnabled: false, alreadySynced: false }
    return {
      userEnabled: Boolean(r.userEnabled),
      alreadySynced: r.historySyncedAt !== null,
    }
  })
}

export async function markSessionHistorySynced(agentId: string): Promise<void> {
  await sql`
    UPDATE "BaileysSession"
    SET "historySyncedAt" = NOW(), "updatedAt" = NOW()
    WHERE "agentId" = ${agentId}
  `
  // Drop the cache so the next getHistorySyncStatus call sees alreadySynced=true.
  invalidateTtl(historySyncCacheKey(agentId))
}

// Upsert a Conversation by (agentId, phoneNumber) and return its id.
// Used by the history-sync handler — does not bump lastActivityAt past
// the historical timestamp, so newly synced old chats sort correctly.
export async function upsertConversationForHistory(
  agentId: string,
  phoneNumber: string,
  contactName: string | null,
  lastActivityAt: Date
): Promise<string> {
  const existing = await sql<{ id: string }[]>`
    SELECT "id" FROM "Conversation"
    WHERE "agentId" = ${agentId} AND "phoneNumber" = ${phoneNumber}
    LIMIT 1
  `
  if (existing[0]) {
    // If a later chunk surfaces a contact name we didn't have before, fill it
    // in. We don't overwrite a name that's already set, since contacts.upsert
    // sometimes gives us better names than a single message's pushName.
    await sql`
      UPDATE "Conversation"
      SET "contactName" = COALESCE(NULLIF("contactName", ''), ${contactName}),
          "lastActivityAt" = GREATEST("lastActivityAt", ${lastActivityAt.toISOString()}::timestamptz)
      WHERE "id" = ${existing[0].id}
    `
    return existing[0].id
  }
  const id = randomUUID()
  await sql`
    INSERT INTO "Conversation" ("id", "agentId", "phoneNumber", "contactName", "mode", "lastActivityAt", "createdAt")
    VALUES (${id}, ${agentId}, ${phoneNumber}, ${contactName}, 'ai',
            ${lastActivityAt.toISOString()}::timestamptz, NOW())
  `
  return id
}

export interface HistoryMessageInsert {
  conversationId: string
  // WhatsApp's per-message id (from key.id). Used to dedupe — see below.
  waMessageId: string | null
  direction: "inbound" | "outbound"
  senderRole: "ai" | "human"
  content: string
  createdAt: Date
}

// Deterministic Message.id derived from the WhatsApp message key. Re-running
// history sync (or re-processing overlapping chunks) sees the same waMessageId
// and naturally hits the primary-key constraint — we use ON CONFLICT DO
// NOTHING to silently skip dupes. If WhatsApp didn't give us a key.id (rare),
// fall back to a random UUID so we still insert, accepting that those rows
// can't be deduped.
function historyMessageId(conversationId: string, waMessageId: string | null): string {
  if (waMessageId && waMessageId.length > 0) {
    return `wahist:${conversationId}:${waMessageId}`
  }
  return randomUUID()
}

export async function bulkInsertHistoryMessages(rows: HistoryMessageInsert[]): Promise<number> {
  if (rows.length === 0) return 0
  let inserted = 0
  // Insert in batches of 200 to avoid an unbounded statement.
  const batchSize = 200
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)

    // Defensive shape coercion: WhatsApp message extraction occasionally
    // yields non-string content (templated buttons, list selections, etc.
    // that don't always serialize cleanly). postgres-js choked on those
    // with "str.replace is not a function" when handed the raw values.
    // We force every column to its correct primitive shape and drop rows
    // that don't have at least content + conversationId + a valid Date.
    const values = batch
      .map((m) => {
        const content = typeof m.content === "string" ? m.content : String(m.content ?? "")
        if (!content.trim()) return null
        if (!m.conversationId) return null
        const createdAt = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt as unknown as string)
        if (Number.isNaN(createdAt.getTime())) return null
        return {
          id: historyMessageId(String(m.conversationId), m.waMessageId),
          conversationId: String(m.conversationId),
          direction: m.direction === "outbound" ? "outbound" : "inbound",
          senderRole: m.senderRole === "human" ? "human" : "ai",
          content,
          createdAt: createdAt.toISOString(),
        }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)

    if (values.length === 0) continue

    // postgres-js doesn't allow ON CONFLICT with the `${sql(values, ...)}`
    // multi-row helper, so we emit per-row inserts. Slower but lets every
    // row dedupe individually via primary key.
    for (const v of values) {
      try {
        const result = await sql`
          INSERT INTO "Message" ("id", "conversationId", "direction", "senderRole", "content", "createdAt")
          VALUES (${v.id}, ${v.conversationId}, ${v.direction}, ${v.senderRole}, ${v.content}, ${v.createdAt}::timestamptz)
          ON CONFLICT ("id") DO NOTHING
        `
        // postgres-js returns the affected row count via `.count`
        if ((result as unknown as { count: number }).count > 0) inserted++
      } catch (rowErr) {
        const rowErrMsg = rowErr instanceof Error ? rowErr.message : String(rowErr)
        logger.warn({ err: rowErrMsg, conversationId: v.conversationId }, "Skipped bad history row")
      }
    }
  }
  return inserted
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
    SELECT a."id", a."userId", COALESCE(u."plan", 'free') as "plan", u."subscriptionExpiresAt",
           COALESCE(u."carryoverCredits", 0) as "carryoverCredits", u."carryoverExpiresAt"
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

// Per-ACCOUNT usage: sum CreditUsage across ALL of a user's agents in the window.
// The plan allowance is account-wide, so enforcement must compare the user's
// TOTAL usage to the limit — not one agent's. Summing a single agent let a user
// with several agents blow past the limit while no individual agent crossed it.
export async function getMonthlyCreditsUsedForUser(userId: string, monthStart: Date, monthEnd: Date): Promise<number> {
  const rows = await sql<{ total: number | null }[]>`
    SELECT COALESCE(SUM(cu."creditsUsed"), 0)::int as total
    FROM "CreditUsage" cu
    JOIN "Agent" a ON a."id" = cu."agentId"
    WHERE a."userId" = ${userId}
      AND cu."createdAt" >= ${monthStart.toISOString()}::timestamptz
      AND cu."createdAt" < ${monthEnd.toISOString()}::timestamptz
  `
  return Number(rows[0]?.total ?? 0)
}

export async function insertCreditUsage(entry: {
  agentId: string
  conversationId?: string
  messageType: "text" | "image"
  source?: "ai" | "human" | "api"
  creditsUsed: number
  // PAYG audit (added in 20260525000000_add_payg_credits):
  tokensInput?: number | null
  tokensOutput?: number | null
  billedTo?: "plan" | "wallet" | null
}): Promise<void> {
  await sql`
    INSERT INTO "CreditUsage"
      ("agentId", "conversationId", "messageType", "source", "creditsUsed",
       "tokensInput", "tokensOutput", "billedTo", "createdAt")
    VALUES (
      ${entry.agentId},
      ${entry.conversationId ?? null},
      ${entry.messageType},
      ${entry.source ?? "ai"},
      ${entry.creditsUsed},
      ${entry.tokensInput ?? null},
      ${entry.tokensOutput ?? null},
      ${entry.billedTo ?? null},
      NOW()
    )
  `
}

// ── Conversation mode ─────────────────────────────────────────────────────────

export async function getConversationMode(phoneNumber: string, agentId: string): Promise<"ai" | "human"> {
  const rows = await sql<{ mode: string }[]>`
    SELECT "mode" FROM "Conversation"
    WHERE "phoneNumber" = ${phoneNumber} AND "agentId" = ${agentId}
    ORDER BY "lastActivityAt" DESC NULLS LAST
    LIMIT 1
  `
  return (rows[0]?.mode === "human") ? "human" : "ai"
}

export async function getAgentIsHumanMode(agentId: string): Promise<boolean> {
  const rows = await sql<{ isActive: boolean }[]>`
    SELECT "isActive" FROM "OrchestratorAgent" WHERE "agentId" = ${agentId} LIMIT 1
  `
  // isActive = false means the agent is in human handoff mode
  if (rows.length === 0) return false
  return rows[0].isActive === false
}

export async function saveHumanOutboundMessage(
  agentId: string,
  customerPhone: string,
  text: string
): Promise<void> {
  // Find existing conversation — don't create one; if there's no conversation the
  // operator is texting someone who never messaged in, which is unusual.
  const convRows = await sql<{ id: string }[]>`
    SELECT "id" FROM "Conversation"
    WHERE "agentId" = ${agentId} AND "phoneNumber" = ${customerPhone}
    LIMIT 1
  `
  const conversationId = convRows[0]?.id
  if (!conversationId) return

  const id = randomUUID()
  await sql`
    INSERT INTO "Message" ("id", "conversationId", "direction", "senderRole", "content", "createdAt")
    VALUES (${id}, ${conversationId}, 'outbound', 'human', ${text}, NOW())
  `
  // Auto-pause AI: when the agent's autoPauseOnHumanReply setting is on,
  // flip the conversation to human mode so the orchestrator skips AI
  // replies for the customer's next inbound. The CASE condition is
  // idempotent — only changes mode when current mode is 'ai' AND the
  // agent has the feature enabled.
  await sql`
    UPDATE "Conversation" c
    SET "lastActivityAt" = NOW(),
        "mode" = CASE
          WHEN c."mode" = 'ai' AND a."autoPauseOnHumanReply" = true THEN 'human'
          ELSE c."mode"
        END
    FROM "Agent" a
    WHERE c."id" = ${conversationId}
      AND a."id" = c."agentId"
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
