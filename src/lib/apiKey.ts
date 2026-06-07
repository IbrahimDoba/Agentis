import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import type { ApiKey } from "@/generated/prisma/client"

// External Developer API key helpers.
//
// A raw key looks like: dz_live_<8 lookup chars><32 secret chars>
//   - The first (API_KEY_PREFIX + 8) chars are the PUBLIC "prefix": an indexed,
//     unique lookup id we store in plaintext and show (masked) in the dashboard.
//   - The whole raw string is bcrypt-hashed; the raw is returned to the caller
//     exactly ONCE at creation and never persisted.
//   - verify() narrows to a single row by prefix (O(1) indexed lookup) and only
//     then runs the expensive bcrypt compare against the candidate's hash.

// Live keys for now; dz_test_ is reserved for a future sandbox mode.
export const API_KEY_PREFIX = "dz_live_"

const LOOKUP_RANDOM_CHARS = 8 // random chars after the prefix that form the lookup id
const SECRET_RANDOM_CHARS = 32 // remaining random chars — the actual secret
const BCRYPT_ROUNDS = 10
const SPEND_WINDOW_MS = 24 * 60 * 60 * 1000 // rolling 24h daily-spend window

// Capabilities a key can carry. "chat" runs agents (safe to embed client-side);
// "manage" configures agents (server-side only).
export const API_KEY_SCOPES = ["chat", "manage"] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value)
}

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

// Crypto-strong base62 string. The tiny modulo bias (256 % 62) is irrelevant
// for an opaque secret of this length.
function randomBase62(len: number): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += BASE62[bytes[i] % 62]
  return out
}

export interface GeneratedApiKey {
  raw: string // full secret — return to the caller ONCE, never store
  prefix: string // public lookup id, safe to store + display
  hash: string // bcrypt(raw) — what we persist
}

// Build a fresh key. Pure (no DB) so it's trivially testable; persistence is
// the caller's job.
export async function generateApiKey(): Promise<GeneratedApiKey> {
  const lookup = randomBase62(LOOKUP_RANDOM_CHARS)
  const secret = randomBase62(SECRET_RANDOM_CHARS)
  const raw = `${API_KEY_PREFIX}${lookup}${secret}`
  const prefix = `${API_KEY_PREFIX}${lookup}`
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS)
  return { raw, prefix, hash }
}

// Extract the public lookup prefix from a raw key without trusting its length.
function lookupPrefix(raw: string): string | null {
  if (!raw.startsWith(API_KEY_PREFIX)) return null
  const expectedLen = API_KEY_PREFIX.length + LOOKUP_RANDOM_CHARS
  if (raw.length < expectedLen) return null
  return raw.slice(0, expectedLen)
}

// Resolve a raw bearer key to its ApiKey row, or null. Returns null for
// unknown, malformed, revoked, or hash-mismatch keys — the caller maps all of
// these to 401 without revealing which (don't help attackers fingerprint keys).
export async function verifyApiKey(raw: string | null | undefined): Promise<ApiKey | null> {
  if (!raw || typeof raw !== "string") return null
  const prefix = lookupPrefix(raw)
  if (!prefix) return null
  const key = await db.apiKey.findUnique({ where: { prefix } })
  if (!key || key.status !== "active") return null
  const ok = await bcrypt.compare(raw, key.hashedKey)
  if (!ok) return null
  return key
}

// Best-effort "last used" stamp. Call fire-and-forget from the route; never
// block a request on it.
export async function touchApiKey(keyId: string): Promise<void> {
  await db.apiKey.update({ where: { id: keyId }, data: { lastUsedAt: new Date() } })
}

export interface CreatedApiKey {
  raw: string // show ONCE to the user; never retrievable again
  record: ApiKey
}

// Create + persist a key for a user. Returns the raw key (shown once) alongside
// the stored record. Retries on the astronomically unlikely prefix collision so
// a clash surfaces as a fresh key rather than a 500.
export async function createApiKey(
  userId: string,
  opts: { name: string; scopes: ApiKeyScope[]; dailySpendingCapCredits?: number | null }
): Promise<CreatedApiKey> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const gen = await generateApiKey()
    try {
      const record = await db.apiKey.create({
        data: {
          userId,
          name: opts.name,
          prefix: gen.prefix,
          hashedKey: gen.hash,
          scopes: opts.scopes,
          dailySpendingCapCredits: opts.dailySpendingCapCredits ?? null,
        },
      })
      return { raw: gen.raw, record }
    } catch (err) {
      // P2002 = unique constraint (prefix collision). Retry with a new key.
      if (isUniqueViolation(err) && attempt < 2) continue
      throw err
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error("createApiKey: exhausted prefix-collision retries")
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002"
}

// Public-safe view of a key — never includes the hash.
export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  scopes: string[]
  status: string
  dailySpendingCapCredits: number | null
  dailySpentCredits: number
  lastUsedAt: Date | null
  createdAt: Date
  revokedAt: Date | null
}

// List a user's keys, newest first. Selects an explicit column set so the
// bcrypt hash never leaves the data layer.
export async function listApiKeysForUser(userId: string): Promise<ApiKeySummary[]> {
  return db.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      status: true,
      dailySpendingCapCredits: true,
      dailySpentCredits: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
  })
}

// Revoke a key only if it belongs to the given user. Returns false when the key
// doesn't exist or isn't theirs — the route maps that to 404 (no cross-user
// revocation, and no leaking which keys exist).
export async function revokeApiKeyForUser(userId: string, keyId: string): Promise<boolean> {
  const res = await db.apiKey.updateMany({
    where: { id: keyId, userId },
    data: { status: "revoked", revokedAt: new Date() },
  })
  return res.count > 0
}

// Revoke a key. Idempotent — re-revoking just refreshes revokedAt.
export async function revokeApiKey(keyId: string): Promise<void> {
  await db.apiKey.update({
    where: { id: keyId },
    data: { status: "revoked", revokedAt: new Date() },
  })
}

// Whether the key's CURRENT rolling-24h window has already met or exceeded its
// cap — checked BEFORE serving a request so we block at the limit. A lapsed
// window isn't blocked: the next spend resets it (handled in recordApiKeySpend).
export async function isApiKeyDailyCapExceeded(keyId: string): Promise<boolean> {
  const key = await db.apiKey.findUnique({
    where: { id: keyId },
    select: { dailySpendingCapCredits: true, dailySpentCredits: true, spendingResetAt: true },
  })
  if (!key || key.dailySpendingCapCredits == null) return false
  const windowActive = key.spendingResetAt != null && key.spendingResetAt > new Date()
  if (!windowActive) return false
  return key.dailySpentCredits >= key.dailySpendingCapCredits
}

export interface SpendResult {
  spent: number // dailySpentCredits AFTER this charge
  cap: number | null // the key's cap, if any
  capExceeded: boolean // true once the running total is past the cap
}

// Record credits spent against a key, applying the rolling 24h window. If the
// window has lapsed (or never started) it resets to a fresh 24h starting now.
// Returns whether the running total now exceeds the key's cap so the caller can
// block the NEXT request. Runs in a transaction to keep the read + write atomic
// under concurrent calls.
export async function recordApiKeySpend(keyId: string, credits: number): Promise<SpendResult> {
  return db.$transaction(async (tx) => {
    const key = await tx.apiKey.findUnique({
      where: { id: keyId },
      select: {
        dailySpentCredits: true,
        spendingResetAt: true,
        dailySpendingCapCredits: true,
      },
    })
    if (!key) throw new Error(`ApiKey ${keyId} not found`)

    const now = new Date()
    const windowLapsed = !key.spendingResetAt || key.spendingResetAt <= now
    const spent = windowLapsed ? credits : key.dailySpentCredits + credits
    const spendingResetAt = windowLapsed
      ? new Date(now.getTime() + SPEND_WINDOW_MS)
      : key.spendingResetAt

    await tx.apiKey.update({
      where: { id: keyId },
      data: { dailySpentCredits: spent, spendingResetAt },
    })

    const cap = key.dailySpendingCapCredits
    return { spent, cap, capExceeded: cap !== null && spent > cap }
  })
}
