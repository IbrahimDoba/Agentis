import { statfs } from "fs/promises"
import path from "path"
import { config } from "../config.js"
import { logger as rootLogger } from "../lib/logger.js"
import { StorageUnwritableError } from "../lib/errors.js"

const logger = rootLogger.child({ module: "auth-health" })

// The volume Baileys writes its per-key auth files to. Same resolution as
// auth-store.ts so we check the exact filesystem that fills.
const AUTH_BASE = path.resolve(config.AUTH_STORAGE_DIR)

// Safety floors for the auth volume. Baileys' `useMultiFileAuthState` writes one
// small file per signal pre-key/session on every ratchet step. When the volume
// runs out of EITHER free bytes OR free inodes, those writes throw ENOSPC and
// the signal session corrupts mid-update — which is exactly what triggered the
// decrypt-fail → retry-receipt → duplicate-delivery storm. We refuse to send
// below these floors so the agent goes SILENT instead of spamming. The floors
// are generous: a single session save touches at most a few dozen files.
const MIN_FREE_BYTES = 20 * 1024 * 1024 // 20 MB
const MIN_FREE_INODES = 2_000

// statfs is a syscall; cache it briefly so a burst of sends doesn't hammer it.
const STATFS_TTL_MS = 5_000
type StorageStatus = { ok: boolean; freeBytes: number; freeInodes: number; reason: string | null }
let cached: { at: number; status: StorageStatus } | null = null

// Per-agent reactive breaker: tripped when an ACTUAL auth write throws (see
// auth-store.ts). Covers failures a free-space check can miss (quota, EROFS,
// permissions). Cleared on a clean reconnect (session-manager onConnected) or
// automatically once the volume is healthy again and the mark has aged out.
const unhealthy = new Map<string, { reason: string; since: number }>()
const REACTIVE_SELF_CLEAR_MS = 60_000

export function markAuthUnhealthy(agentId: string, reason: string): void {
  if (!unhealthy.has(agentId)) {
    logger.error(
      { agentId, reason },
      "Auth persistence FAILED — failing closed; this agent will stop sending until storage recovers"
    )
  }
  unhealthy.set(agentId, { reason, since: Date.now() })
}

export function clearAuthUnhealthy(agentId: string): void {
  if (unhealthy.delete(agentId)) {
    logger.info({ agentId }, "Auth persistence recovered — sending re-enabled")
  }
}

async function readStorage(): Promise<StorageStatus> {
  const now = Date.now()
  if (cached && now - cached.at < STATFS_TTL_MS) return cached.status

  let status: StorageStatus
  try {
    const s = await statfs(AUTH_BASE)
    const freeBytes = Number(s.bavail) * Number(s.bsize)
    // `files` is 0 on filesystems with no inode concept (some overlay/tmpfs) —
    // only enforce the inode floor when the FS actually reports inodes.
    const hasInodes = Number(s.files) > 0
    const freeInodes = hasInodes ? Number(s.ffree) : Number.MAX_SAFE_INTEGER
    const lowBytes = freeBytes < MIN_FREE_BYTES
    const lowInodes = hasInodes && freeInodes < MIN_FREE_INODES
    const ok = !lowBytes && !lowInodes
    const reason = ok
      ? null
      : lowInodes
        ? `inodes low (${freeInodes} free < ${MIN_FREE_INODES})`
        : `disk low (${Math.round(freeBytes / 1024 / 1024)}MB free < ${MIN_FREE_BYTES / 1024 / 1024}MB)`
    status = { ok, freeBytes, freeInodes, reason }
    if (!ok) {
      logger.error({ freeBytes, freeInodes, reason }, "Auth volume below safety floor — refusing sends (fail closed)")
    }
  } catch (err) {
    // If we cannot even stat the volume, do NOT block all sends on a transient
    // stat error — a real write failure still trips the per-agent breaker.
    logger.warn({ err }, "statfs on auth volume failed — treating as writable")
    status = { ok: true, freeBytes: Number.MAX_SAFE_INTEGER, freeInodes: Number.MAX_SAFE_INTEGER, reason: null }
  }
  cached = { at: now, status }
  return status
}

/** Current storage health (cached). For health endpoints / diagnostics. */
export async function getStorageStatus(): Promise<StorageStatus> {
  return readStorage()
}

/**
 * The universal, no-bypass guard called at the top of every real send (pacing).
 * Throws StorageUnwritableError when the shared auth volume is below its floor,
 * so NO message goes out during a disk/inode-full condition — regardless of
 * which queue or route initiated it.
 */
export async function assertStorageWritable(): Promise<void> {
  const s = await readStorage()
  if (!s.ok) throw new StorageUnwritableError(s.reason ?? "unknown")
}

/**
 * Per-agent send gate used by the outbound queue so it can DROP a job cleanly
 * (no retry storm) instead of throwing. Returns a human-readable reason to skip,
 * or null when it is safe to send. Combines the global volume floor with the
 * per-agent reactive breaker.
 */
export async function blockSendReason(agentId: string): Promise<string | null> {
  const s = await readStorage()
  if (!s.ok) return s.reason

  const mark = unhealthy.get(agentId)
  if (mark) {
    // Volume is healthy again — let an aged-out reactive mark clear so the agent
    // recovers on its own (if the next write fails, it re-trips immediately).
    if (Date.now() - mark.since > REACTIVE_SELF_CLEAR_MS) {
      clearAuthUnhealthy(agentId)
      return null
    }
    return `auth-unhealthy: ${mark.reason}`
  }
  return null
}
