import { getRedis } from "@/lib/redis"

// Optional Idempotency-Key support for the External Developer API. When a caller
// supplies an `Idempotency-Key` header, we cache the successful response under
// (apiKeyId, idempotencyKey) for 24h so a retried request replays the same
// response WITHOUT charging again. Best-effort: if Redis is down, idempotency is
// silently skipped (the request just runs normally).

const TTL_SEC = 24 * 60 * 60

function redisKey(apiKeyId: string, idempotencyKey: string): string {
  return `apiidem:${apiKeyId}:${idempotencyKey}`
}

// Return a previously stored response body for this (key, idempotency-key), or
// null if none / Redis unavailable.
export async function getIdempotentResponse(
  apiKeyId: string,
  idempotencyKey: string
): Promise<unknown | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const cached = await redis.get(redisKey(apiKeyId, idempotencyKey))
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

// Store a response body for replay. Best-effort.
export async function storeIdempotentResponse(
  apiKeyId: string,
  idempotencyKey: string,
  body: unknown
): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(redisKey(apiKeyId, idempotencyKey), JSON.stringify(body), "EX", TTL_SEC)
  } catch {
    /* best-effort — a failed cache write just means no replay */
  }
}
