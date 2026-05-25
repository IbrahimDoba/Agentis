import { getRedis } from "./redis"

// Best-effort JSON cache over Redis. Every operation degrades gracefully: if
// Redis is unavailable or a command throws, we fall back to the loader (cache
// read) or silently skip (cache write / invalidate). A caching layer must
// never turn a working request into a failed one.

/**
 * Return the cached value for `key`, or run `loader`, cache its result for
 * `ttlSeconds`, and return it. `null`/`undefined` results ARE cached (e.g. a
 * "not found" lookup) — distinct from a cache miss.
 */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const redis = getRedis()
  if (!redis) return loader()

  try {
    const hit = await redis.get(key)
    if (hit !== null) return JSON.parse(hit) as T
  } catch {
    // Cache read failed — fall through to the loader.
  }

  const value = await loader()

  try {
    await redis.set(key, JSON.stringify(value ?? null), "EX", ttlSeconds)
  } catch {
    // Cache write failed — the caller still got a correct value.
  }

  return value
}

/** Drop one or more cache keys. No-op if Redis is unavailable. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(...keys)
  } catch {
    // Best-effort — a stale entry will expire on its own TTL.
  }
}
