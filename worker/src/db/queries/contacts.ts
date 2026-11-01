import { sql } from "../client.js"
import { randomUUID } from "crypto"
import { cachedTtl, invalidateTtl } from "../../lib/ttl-cache.js"
import { isJunkName, type AddressBookEntry } from "../../baileys/contact-save.js"

export type ContactSaveRunStatus = "running" | "paused" | "completed" | "cancelled"

export interface ContactSaveRun {
  id: string
  agentId: string
  status: ContactSaveRunStatus
  pauseReason: string | null
  waitingUntil: string | null
  nameTag: string | null
  cursor: string | null
  totalCount: number
  savedCount: number
  failedCount: number
  creditsUsed: number
  createdAt: string
  completedAt: string | null
}

export interface CandidateChat {
  id: string
  phone: string
  name: string
}

// savedBy is left alone on conflict: a number Dailzero saved echoes back through
// contact sync moments later and must stay attributed to Dailzero.
export async function upsertAddressBook(agentId: string, entries: AddressBookEntry[]): Promise<void> {
  if (entries.length === 0) return
  for (let i = 0; i < entries.length; i += 500) {
    // updatedAt has no DB default (Prisma's @updatedAt is client-side), so raw
    // inserts must set it or Postgres rejects the row.
    const now = new Date()
    const rows = entries.slice(i, i + 500).map((e) => ({
      id: randomUUID(),
      agentId,
      phone: e.phone,
      name: e.name,
      updatedAt: now,
    }))
    await sql`
      INSERT INTO "WhatsAppContact" ${sql(rows, "id", "agentId", "phone", "name", "updatedAt")}
      ON CONFLICT ("agentId", "phone") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = now()
    `
  }
}

export async function markSavedByDailzero(agentId: string, phone: string, name: string): Promise<void> {
  await sql`
    INSERT INTO "WhatsAppContact" ("id", "agentId", "phone", "name", "savedBy", "updatedAt")
    VALUES (${randomUUID()}, ${agentId}, ${phone}, ${name}, 'dailzero', now())
    ON CONFLICT ("agentId", "phone") DO UPDATE SET "savedBy" = 'dailzero', "name" = EXCLUDED."name", "updatedAt" = now()
  `
}

export async function isInAddressBook(agentId: string, phone: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM "WhatsAppContact" WHERE "agentId" = ${agentId} AND "phone" = ${phone} LIMIT 1
  `
  return rows.length > 0
}

export async function countAddressBook(agentId: string): Promise<{ total: number; byDailzero: number }> {
  const [row] = await sql<{ total: number; byDailzero: number }[]>`
    SELECT count(*)::int AS "total", count(*) FILTER (WHERE "savedBy" = 'dailzero')::int AS "byDailzero"
    FROM "WhatsAppContact" WHERE "agentId" = ${agentId}
  `
  return row ?? { total: 0, byDailzero: 0 }
}

// Chats with a usable name whose number isn't in the address book yet, in id
// order from `afterId` — the run's cursor. Junk names are filtered here rather
// than in SQL; the caller advances the cursor past them so they're never retried.
export async function listCandidateChats(agentId: string, afterId: string | null, limit: number): Promise<Array<CandidateChat & { junk: boolean }>> {
  const rows = await sql<CandidateChat[]>`
    SELECT c."id", c."phoneNumber" AS "phone", trim(c."contactName") AS "name"
    FROM "Conversation" c
    WHERE c."agentId" = ${agentId}
      AND c."phoneNumber" ~ '^[0-9]{10,13}$'
      AND coalesce(trim(c."contactName"), '') <> ''
      AND (${afterId}::text IS NULL OR c."id" > ${afterId})
      AND NOT EXISTS (
        SELECT 1 FROM "WhatsAppContact" w WHERE w."agentId" = c."agentId" AND w."phone" = c."phoneNumber"
      )
    ORDER BY c."id" ASC
    LIMIT ${limit}
  `
  return rows.map((r) => ({ ...r, junk: isJunkName(r.name) }))
}

export async function countSaveableChats(agentId: string): Promise<number> {
  let total = 0
  let cursor: string | null = null
  for (;;) {
    const page = await listCandidateChats(agentId, cursor, 2000)
    total += page.filter((c) => !c.junk).length
    if (page.length < 2000) return total
    cursor = page[page.length - 1].id
  }
}

// An advisory lock per agent makes "one active run" hold even when the owner
// double-clicks Start: the second request waits, then sees the first run.
export async function createRunIfNone(agentId: string, totalCount: number, nameTag: string | null): Promise<{ run: ContactSaveRun; created: boolean }> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`contact-save:${agentId}`}))`
    const [existing] = await tx<ContactSaveRun[]>`
      SELECT * FROM "ContactSaveRun"
      WHERE "agentId" = ${agentId} AND "status" IN ('running', 'paused')
      LIMIT 1
    `
    if (existing) return { run: existing, created: false }
    const [run] = await tx<ContactSaveRun[]>`
      INSERT INTO "ContactSaveRun" ("id", "agentId", "status", "nameTag", "totalCount")
      VALUES (${randomUUID()}, ${agentId}, 'running', ${nameTag}, ${totalCount})
      RETURNING *
    `
    return { run, created: true }
  }) as Promise<{ run: ContactSaveRun; created: boolean }>
}

export async function getRun(id: string): Promise<ContactSaveRun | null> {
  const [row] = await sql<ContactSaveRun[]>`SELECT * FROM "ContactSaveRun" WHERE "id" = ${id} LIMIT 1`
  return row ?? null
}

export async function getLatestRun(agentId: string): Promise<ContactSaveRun | null> {
  const [row] = await sql<ContactSaveRun[]>`
    SELECT * FROM "ContactSaveRun" WHERE "agentId" = ${agentId}
    ORDER BY "createdAt" DESC LIMIT 1
  `
  return row ?? null
}

// Status changes are guarded on the current status so a stale job can't, say,
// complete a run the owner just cancelled.
export async function setRunStatus(
  id: string,
  from: ContactSaveRunStatus[],
  to: ContactSaveRunStatus,
  pauseReason: string | null = null,
): Promise<boolean> {
  const rows = await sql`
    UPDATE "ContactSaveRun"
    SET "status" = ${to}, "pauseReason" = ${pauseReason}, "waitingUntil" = NULL,
        "completedAt" = ${to === "completed" || to === "cancelled" ? sql`now()` : null}
    WHERE "id" = ${id} AND "status" IN ${sql(from)}
    RETURNING "id"
  `
  return rows.length > 0
}

export async function setRunWaiting(id: string, until: Date): Promise<void> {
  await sql`UPDATE "ContactSaveRun" SET "waitingUntil" = ${until} WHERE "id" = ${id}`
}

export async function recordRunProgress(id: string, opts: { cursor: string; saved?: boolean; failed?: boolean; credits?: number }): Promise<void> {
  await sql`
    UPDATE "ContactSaveRun"
    SET "cursor" = ${opts.cursor},
        "waitingUntil" = NULL,
        "savedCount" = "savedCount" + ${opts.saved ? 1 : 0},
        "failedCount" = "failedCount" + ${opts.failed ? 1 : 0},
        "creditsUsed" = "creditsUsed" + ${opts.credits ?? 0}
    WHERE "id" = ${id}
  `
}

export interface ContactSaveSettings {
  autoSaveContacts: boolean
  contactNameTag: string | null
}

const settingsKey = (agentId: string) => `contact-save-settings:${agentId}`

// Read on every inbound message for auto-save, hence the short cache. The app
// calls the worker's invalidate route when the owner changes these.
export async function getContactSaveSettings(agentId: string): Promise<ContactSaveSettings> {
  return cachedTtl(settingsKey(agentId), 60_000, async () => {
    const [row] = await sql<ContactSaveSettings[]>`
      SELECT "autoSaveContacts", "contactNameTag" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
    `
    return row ?? { autoSaveContacts: false, contactNameTag: null }
  })
}

export function invalidateContactSaveSettings(agentId: string): void {
  invalidateTtl(settingsKey(agentId))
}
