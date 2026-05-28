// Tiny in-process TTL cache. The worker is a single long-lived Node process,
// so an in-process Map keyed by string outperforms a Redis round trip for
// hot, per-agent metadata that almost never changes.

interface Entry { value: unknown; expiresAt: number }

const cache = new Map<string, Entry>()

/**
 * Return the cached value for `key` if still fresh, otherwise run `loader`,
 * cache its result for `ttlMs`, and return it. Negative results (null) are
 * cached too — useful for "not configured" lookups so they don't re-hit the DB.
 */
export async function cachedTtl<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now()
  const entry = cache.get(key)
  if (entry && entry.expiresAt > now) return entry.value as T

  const value = await loader()
  cache.set(key, { value, expiresAt: now + ttlMs })
  return value
}

/** Drop a cache entry (e.g. on a known mutation). */
export function invalidateTtl(key: string): void {
  cache.delete(key)
}

/** Drop every entry whose key starts with `prefix`. */
export function invalidateTtlPrefix(prefix: string): void {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
}

// Test-only: clear the entire cache between tests.
export function __resetTtlCacheForTests(): void {
  cache.clear()
}
