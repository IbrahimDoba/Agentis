import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys"
import type { AuthenticationCreds, SignalDataTypeMap } from "@whiskeysockets/baileys"
import { readFile, rm } from "fs/promises"
import { existsSync, readdirSync } from "fs"
import path from "path"
import { sql } from "../db/client.js"
import { encrypt, decrypt } from "../lib/crypto.js"
import { config } from "../config.js"
import { markAuthUnhealthy } from "./auth-health.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "auth-store-pg" })

// Same volume the legacy file store used — read only, for one-time backfill.
const AUTH_BASE = path.resolve(config.AUTH_STORAGE_DIR)
const CREDS_CATEGORY = "creds"
const CREDS_ID = "creds"

// Baileys SignalData categories, longest-first so backfill can disambiguate a
// filename's category prefix (e.g. "sender-key-memory" before "sender-key").
const CATEGORIES = [
  "app-state-sync-version",
  "app-state-sync-key",
  "sender-key-memory",
  "sender-key",
  "pre-key",
  "session",
]

// Mirror Baileys' fixFileName so a keyId is addressed identically to the file
// store: '/'→'__', ':'→'-'. This lets backfilled filename-ids line up exactly
// with the ids Baileys passes to get()/set() at runtime.
export function fixId(id: string): string {
  return id.replace(/\//g, "__").replace(/:/g, "-")
}

export function serialize(value: unknown): Buffer {
  return encrypt(Buffer.from(JSON.stringify(value, BufferJSON.replacer), "utf8"))
}

export function deserialize<T = unknown>(buf: Buffer): T {
  return JSON.parse(decrypt(buf).toString("utf8"), BufferJSON.reviver) as T
}

async function readOne(agentId: string, category: string, keyId: string): Promise<unknown | null> {
  const rows = await sql<{ value: Uint8Array }[]>`
    SELECT "value" FROM "BaileysAuthKey"
    WHERE "agentId" = ${agentId} AND "category" = ${category} AND "keyId" = ${keyId}
    LIMIT 1
  `
  if (!rows.length) return null
  return deserialize(Buffer.from(rows[0].value))
}

export async function pgHasCreds(agentId: string): Promise<boolean> {
  const rows = await sql<{ one: number }[]>`
    SELECT 1 AS one FROM "BaileysAuthKey"
    WHERE "agentId" = ${agentId} AND "category" = ${CREDS_CATEGORY} AND "keyId" = ${CREDS_ID}
    LIMIT 1
  `
  return rows.length > 0
}

/** Remove all of an agent's auth keys (session destroy / logout). */
export async function purgePgAuthKeys(agentId: string): Promise<void> {
  try {
    await sql`DELETE FROM "BaileysAuthKey" WHERE "agentId" = ${agentId}`
    logger.info({ agentId }, "Purged Postgres auth keys")
  } catch (err) {
    logger.warn({ err, agentId }, "Failed to purge Postgres auth keys")
  }
}

/**
 * One-time migration: copy an agent's existing plaintext file-store auth into
 * Postgres (encrypted). Preserves the device link so no QR re-scan is needed.
 * The local files are Baileys plaintext JSON; we parse with BufferJSON, encrypt,
 * and upsert. Returns the number of keys migrated (0 if the agent had no files).
 */
async function backfillFromFiles(agentId: string): Promise<number> {
  const dir = path.join(AUTH_BASE, agentId)
  if (!existsSync(dir)) return 0

  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch {
    return 0
  }
  if (!files.length) return 0

  const records: { agentId: string; category: string; keyId: string; value: Buffer; updatedAt: Date }[] = []
  for (const file of files) {
    const parsed = parseFileName(file)
    if (!parsed) continue
    try {
      const raw = await readFile(path.join(dir, file), "utf-8")
      const value = JSON.parse(raw, BufferJSON.reviver)
      records.push({
        agentId,
        category: parsed.category,
        keyId: parsed.keyId,
        value: serialize(value),
        updatedAt: new Date(),
      })
    } catch (err) {
      logger.warn({ err, agentId, file }, "backfill: could not read/parse auth file — skipping")
    }
  }
  if (!records.length) return 0

  await sql`
    INSERT INTO "BaileysAuthKey" ${sql(records, "agentId", "category", "keyId", "value", "updatedAt")}
    ON CONFLICT ("agentId", "category", "keyId")
    DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"
  `
  logger.info({ agentId, migrated: records.length }, "Backfilled auth state from files into Postgres")
  return records.length
}

// Split a file-store filename into (category, keyId). The keyId is already in
// the file store's fixed form, matching fixId() used at runtime.
export function parseFileName(fileName: string): { category: string; keyId: string } | null {
  if (!fileName.endsWith(".json")) return null
  const base = fileName.slice(0, -5) // strip ".json"
  if (base === "creds") return { category: CREDS_CATEGORY, keyId: CREDS_ID }
  for (const c of CATEGORIES) {
    if (base.startsWith(c + "-")) return { category: c, keyId: base.slice(c.length + 1) }
  }
  return null
}

/**
 * Postgres-backed Baileys auth state. One row per signal key — no per-key files,
 * so the auth footprint can never exhaust the volume's inodes. API-compatible
 * with getEncryptedAuthState (returns { state, saveCreds }).
 */
export async function getPostgresAuthState(agentId: string) {
  // First load for this agent: migrate any existing file-store state into
  // Postgres. Only reclaim the local dir when explicitly enabled — by default we
  // KEEP the files as a fallback (see AUTH_RECLAIM_MIGRATED). Backfill never
  // deletes anything until the DB write above has resolved successfully.
  if (!(await pgHasCreds(agentId))) {
    const migrated = await backfillFromFiles(agentId)
    if (migrated > 0 && config.AUTH_RECLAIM_MIGRATED) await reclaimLocalDir(agentId)
  }

  const loadedCreds = (await readOne(agentId, CREDS_CATEGORY, CREDS_ID)) as AuthenticationCreds | null
  const creds: AuthenticationCreds = loadedCreds ?? initAuthCreds()

  const saveCreds = async () => {
    try {
      const value = serialize(creds)
      await sql`
        INSERT INTO "BaileysAuthKey" ("agentId", "category", "keyId", "value", "updatedAt")
        VALUES (${agentId}, ${CREDS_CATEGORY}, ${CREDS_ID}, ${value}, ${new Date()})
        ON CONFLICT ("agentId", "category", "keyId")
        DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"
      `
    } catch (err) {
      markAuthUnhealthy(agentId, `pg saveCreds: ${(err as Error).message}`)
      throw err
    }
  }

  const state = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const wanted = ids.map(fixId)
        const rows = await sql<{ keyId: string; value: Uint8Array }[]>`
          SELECT "keyId", "value" FROM "BaileysAuthKey"
          WHERE "agentId" = ${agentId} AND "category" = ${type} AND "keyId" = ANY(${wanted})
        `
        const byKey = new Map(rows.map((r) => [r.keyId, r.value]))
        const data: { [id: string]: SignalDataTypeMap[T] } = {}
        for (const id of ids) {
          const raw = byKey.get(fixId(id))
          let value = raw ? deserialize(Buffer.from(raw)) : null
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as object)
          }
          // Mirror the file store: include every requested id (null when absent).
          data[id] = value as SignalDataTypeMap[T]
        }
        return data
      },
      set: async (data: { [category: string]: { [id: string]: unknown } }) => {
        try {
          const upserts: { agentId: string; category: string; keyId: string; value: Buffer; updatedAt: Date }[] = []
          const deletes: { category: string; keyId: string }[] = []
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              const keyId = fixId(id)
              if (value) {
                upserts.push({ agentId, category, keyId, value: serialize(value), updatedAt: new Date() })
              } else {
                deletes.push({ category, keyId })
              }
            }
          }
          if (!upserts.length && !deletes.length) return
          await sql.begin(async (tx) => {
            if (upserts.length) {
              await tx`
                INSERT INTO "BaileysAuthKey" ${tx(upserts, "agentId", "category", "keyId", "value", "updatedAt")}
                ON CONFLICT ("agentId", "category", "keyId")
                DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"
              `
            }
            for (const d of deletes) {
              await tx`
                DELETE FROM "BaileysAuthKey"
                WHERE "agentId" = ${agentId} AND "category" = ${d.category} AND "keyId" = ${d.keyId}
              `
            }
          })
        } catch (err) {
          markAuthUnhealthy(agentId, `pg keys.set: ${(err as Error).message}`)
          throw err
        }
      },
    },
  }

  return { state, saveCreds }
}

async function reclaimLocalDir(agentId: string): Promise<void> {
  const dir = path.join(AUTH_BASE, agentId)
  try {
    await rm(dir, { recursive: true, force: true })
    logger.info({ agentId }, "Reclaimed local auth dir after Postgres migration (freed inodes)")
  } catch (err) {
    logger.warn({ err, agentId }, "Could not reclaim local auth dir after migration")
  }
}

/**
 * Startup sweep: delete local auth dirs for agents already migrated to Postgres
 * (creds present in the DB). Frees inodes held by dirs left behind on prior
 * runs. Agents NOT yet in Postgres are left untouched — their files are still
 * the only copy until they next connect and backfill.
 */
export async function reclaimMigratedAuthDirs(): Promise<number> {
  if (!existsSync(AUTH_BASE)) return 0
  let dirs: string[] = []
  try {
    dirs = readdirSync(AUTH_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch (err) {
    logger.warn({ err }, "reclaimMigratedAuthDirs: could not list auth dir")
    return 0
  }
  let removed = 0
  for (const agentId of dirs) {
    try {
      if (await pgHasCreds(agentId)) {
        await rm(path.join(AUTH_BASE, agentId), { recursive: true, force: true })
        removed++
      }
    } catch { /* ignore */ }
  }
  if (removed > 0) logger.info({ removed }, "Reclaimed local auth dirs for agents already in Postgres")
  return removed
}
