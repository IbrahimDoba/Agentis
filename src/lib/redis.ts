import Redis from "ioredis"

// Shared Redis client for Next.js — server-side caching (Phase 2) and SSE
// pub/sub (Phase 3). Best-effort: if REDIS_URL is unset or the server is
// unreachable, getRedis() returns null and callers fall back to the DB. Redis
// being down must never break a request.

const globalForRedis = globalThis as unknown as { redis?: Redis | null }

let attempted = false

export function getRedis(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis
  if (attempted) return null
  attempted = true

  const url = process.env.REDIS_URL
  if (!url) {
    globalForRedis.redis = null
    return null
  }

  const client = new Redis(url, {
    // Caching is optional, so bound every wait: commands time out in 1s and we
    // stop reconnecting after a few tries. A Redis outage then degrades to
    // direct DB reads (the cache helpers try/catch and fall back) instead of
    // hanging the request. Offline queue stays ON so the very first command
    // after a cold start waits for the connection rather than erroring.
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
    connectTimeout: 1000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  })
  // Swallow connection errors; the helpers below try/catch every command.
  client.on("error", () => {})

  globalForRedis.redis = client
  return client
}
