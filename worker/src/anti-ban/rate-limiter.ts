import { getRedis } from "../queue/redis.js"
import { getTierConfig, HARD_CAPS } from "./warmup.js"
import { RateLimitError } from "../lib/errors.js"

function dailyKey(agentId: string) {
  const d = new Date().toISOString().slice(0, 10)
  return `rl:daily:${agentId}:${d}`
}

function hourlyKey(agentId: string) {
  const h = new Date().toISOString().slice(0, 13)
  return `rl:hourly:${agentId}:${h}`
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

  const [daily, hourly] = await Promise.all([
    redis.incr(dailyKey(agentId)),
    redis.incr(hourlyKey(agentId)),
  ])

  // Set TTL on first increment
  if (daily === 1) await redis.expire(dailyKey(agentId), 86400)
  if (hourly === 1) await redis.expire(hourlyKey(agentId), 3600)

  if (daily > HARD_CAPS.maxPerDay || daily > tier.maxPerDay) {
    throw new RateLimitError(`Daily cap reached (${daily}/${Math.min(HARD_CAPS.maxPerDay, tier.maxPerDay)})`)
  }
  if (hourly > HARD_CAPS.maxPerHour || hourly > tier.maxPerHour) {
    throw new RateLimitError(`Hourly cap reached (${hourly}/${Math.min(HARD_CAPS.maxPerHour, tier.maxPerHour)})`)
  }
}

/**
 * §7.4 — Check if the same text was sent to another contact in the last 5 minutes.
 * Prevents broadcast-like behavior.
 */
export async function checkDuplicateText(text: string): Promise<void> {
  const redis = getRedis()
  const key = `rl:text:${Buffer.from(text).toString("base64").slice(0, 64)}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 300)
  if (count > 1) {
    throw new RateLimitError("Same message sent to multiple contacts within 5 minutes")
  }
}

/**
 * Track new contacts (§7.10 — max 50 new contacts/day).
 */
export async function trackNewContact(agentId: string, jid: string): Promise<void> {
  const redis = getRedis()
  const seenKey = `rl:seen:${agentId}:${jid}`
  const isNew = (await redis.set(seenKey, "1", "EX", 86400, "NX")) === "OK"

  if (isNew) {
    const key = newContactKey(agentId)
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 86400)
    if (count > HARD_CAPS.maxNewContactsPerDay) {
      throw new RateLimitError(`New contact daily cap reached (${HARD_CAPS.maxNewContactsPerDay})`)
    }
  }
}
