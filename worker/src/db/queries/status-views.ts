import { randomUUID } from "crypto"
import { sql } from "../client.js"
import type { StatusEventKind } from "../../baileys/status-post.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "status-views" })

interface Pending {
  postId: string
  agentId: string
  phone: string
  deliveredAt: Date | null
  viewedAt: Date | null
  likedAt: Date | null
  repliedAt: Date | null
}

const FIELD: Record<StatusEventKind, "deliveredAt" | "viewedAt" | "likedAt" | "repliedAt"> = {
  delivered: "deliveredAt",
  viewed: "viewedAt",
  liked: "likedAt",
  replied: "repliedAt",
}

// A post to 10k contacts produces ~20k receipts within minutes. They're merged
// in memory and written in batches instead of one upsert per receipt.
const pending = new Map<string, Pending>()
let timer: NodeJS.Timeout | null = null
const FLUSH_MS = 3_000

export function queueStatusEvent(postId: string, agentId: string, phone: string, kind: StatusEventKind, at: Date): void {
  const key = `${postId}|${phone}`
  const row = pending.get(key) ?? { postId, agentId, phone, deliveredAt: null, viewedAt: null, likedAt: null, repliedAt: null }
  const field = FIELD[kind]
  if (!row[field] || at < row[field]!) row[field] = at
  pending.set(key, row)
  if (!timer) {
    timer = setTimeout(() => void flushStatusEvents(), FLUSH_MS)
    timer.unref()
  }
}

// Earliest time wins for every field (Postgres LEAST skips NULLs), so a
// replayed receipt or a late flush can never move a view later or erase it.
export async function flushStatusEvents(): Promise<void> {
  timer = null
  if (pending.size === 0) return
  const rows = [...pending.values()]
  pending.clear()
  const now = new Date()
  try {
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500).map((r) => ({ id: randomUUID(), ...r, updatedAt: now }))
      await sql`
        INSERT INTO "StatusView" ${sql(batch, "id", "postId", "agentId", "phone", "deliveredAt", "viewedAt", "likedAt", "repliedAt", "updatedAt")}
        ON CONFLICT ("postId", "phone") DO UPDATE SET
          "deliveredAt" = LEAST("StatusView"."deliveredAt", EXCLUDED."deliveredAt"),
          "viewedAt" = LEAST("StatusView"."viewedAt", EXCLUDED."viewedAt"),
          "likedAt" = LEAST("StatusView"."likedAt", EXCLUDED."likedAt"),
          "repliedAt" = LEAST("StatusView"."repliedAt", EXCLUDED."repliedAt"),
          "updatedAt" = now()
      `
    }
  } catch (err) {
    // Analytics is best-effort; dropping a batch beats retrying into a loop.
    logger.warn({ err: (err as Error)?.message, rows: rows.length }, "Failed to write status analytics batch")
  }
}

// Receipts arrive for every status, including ones the owner posted from their
// phone (not in our table). Both answers are cached so a busy status doesn't
// turn each receipt into a query.
const postIds = new Map<string, { postId: string | null; expires: number }>()

export async function postIdForStatus(agentId: string, waMessageId: string): Promise<string | null> {
  const key = `${agentId}|${waMessageId}`
  const hit = postIds.get(key)
  if (hit && hit.expires > Date.now()) return hit.postId
  const [row] = await sql<{ id: string }[]>`
    SELECT "id" FROM "StatusPost" WHERE "agentId" = ${agentId} AND "waMessageId" = ${waMessageId} LIMIT 1
  `
  const postId = row?.id ?? null
  if (postIds.size > 5_000) postIds.clear()
  postIds.set(key, { postId, expires: Date.now() + (postId ? 6 : 1) * 60 * 60 * 1000 })
  return postId
}

// Called right after posting: the receipt burst starts before any cache miss
// could have seen the new waMessageId.
export function rememberStatusPost(agentId: string, waMessageId: string, postId: string): void {
  postIds.set(`${agentId}|${waMessageId}`, { postId, expires: Date.now() + 6 * 60 * 60 * 1000 })
}
