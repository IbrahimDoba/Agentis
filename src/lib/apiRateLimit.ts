import { getRedis } from "@/lib/redis"

// Per-key rate limiting for the External Developer API. Fixed-window counter in
// Redis. Best-effort: if Redis is unavailable the request is allowed (fail
// open) — matching the codebase stance that "Redis down must never break a
// request." A brief outage means no rate limiting, never a hard failure.

export const DEFAULT_RATE_LIMIT = 60 // requests
export const DEFAULT_RATE_WINDOW_SEC = 60 // per minute

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export async function checkApiRateLimit(
  keyId: string,
  limit = DEFAULT_RATE_LIMIT,
  windowSec = DEFAULT_RATE_WINDOW_SEC
): Promise<RateLimitResult> {
  const redis = getRedis()
  if (!redis) return { allowed: true, remaining: limit, retryAfterSec: 0 }

  const now = Date.now()
  const windowMs = windowSec * 1000
  const bucket = Math.floor(now / windowMs)
  const redisKey = `apiratelimit:${keyId}:${bucket}`

  try {
    const count = await redis.incr(redisKey)
    if (count === 1) {
      // Set TTL only on first hit of the window so the key self-expires.
      await redis.expire(redisKey, windowSec)
    }
    if (count > limit) {
      const msIntoWindow = now - bucket * windowMs
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - msIntoWindow) / 1000))
      return { allowed: false, remaining: 0, retryAfterSec }
    }
    return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSec: 0 }
  } catch {
    return { allowed: true, remaining: limit, retryAfterSec: 0 }
  }
}
