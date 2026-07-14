import { getRedis } from "../queue/redis.js"
import { getTierConfig, HARD_CAPS } from "./warmup.js"
import { RateLimitError } from "../lib/errors.js"

function dailyKey(agentId: string) {
  const d = new Date().toISOString().slice(0, 10)
  return `rl:daily:${agentId}:${d}`
}


function newContactKey(agentId: string) {
  const d = new Date().toISOString().slice(0, 10)
  return `rl:newcontacts:${agentId}:${d}`
}

/**
 * Check and increment rate-limit counters.
 * Throws RateLimitError if any cap is exceeded.
 */
export async function checkAndIncrement(agentId: string, warmupTier: number): Promise<void> {
  const redis = getRedis()
  const tier = getTierConfig(warmupTier)

  const daily = await redis.incr(dailyKey(agentId))
  if (daily === 1) await redis.expire(dailyKey(agentId), 86400)

  if (daily > HARD_CAPS.maxPerDay || daily > tier.maxPerDay) {
    throw new RateLimitError(`Daily cap reached (${daily}/${Math.min(HARD_CAPS.maxPerDay, tier.maxPerDay)})`)
  }
}

/**
 * §7.4 — Check if the same text was sent to another contact in the last 5 minutes.
 * Prevents broadcast-like behavior.
 */
export async function checkDuplicateText(text: string, jid: string): Promise<void> {
  const redis = getRedis()
  const textHash = Buffer.from(text).toString("base64").slice(0, 64)
  const key = `rl:text:${textHash}`
  // Store the JID that first sent this text
  const existing = await redis.set(key, jid, "EX", 300, "NX")
  if (existing === "OK") return // first time — allowed

  // Key exists — check if it's the same contact (retry) or different (broadcast)
  const storedJid = await redis.get(key)
  if (storedJid === jid) return // same contact, allow retry

  throw new RateLimitError("Same message sent to multiple contacts within 5 minutes")
}

/**
 * Track new contacts (§7.10 — max 50 new contacts/day).
 *
 * The cap exists to stop UNSOLICITED first-contact sends — the real ban vector.
 * A reply inside a conversation the CUSTOMER started is not outreach, so
 * callers pass enforceCap:false for those: the contact is still marked seen
 * (so later genuine outreach to them isn't miscounted as "new") but the reply
 * neither consumes nor enforces the daily budget. Without this, a busy ad
 * campaign burns the 50 slots by evening and every additional NEW customer
 * gets silence instead of an AI reply.
 */
export async function trackNewContact(
  agentId: string,
  jid: string,
  opts: { enforceCap?: boolean } = {}
): Promise<void> {
  const enforceCap = opts.enforceCap ?? true
  const redis = getRedis()
  const seenKey = `rl:seen:${agentId}:${jid}`
  const isNew = (await redis.set(seenKey, "1", "EX", 86400, "NX")) === "OK"

  if (isNew && enforceCap) {
    const key = newContactKey(agentId)
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 86400)
    if (count > HARD_CAPS.maxNewContactsPerDay) {
      throw new RateLimitError(`New contact daily cap reached (${HARD_CAPS.maxNewContactsPerDay})`)
    }
  }
}
