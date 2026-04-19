import { getRedis } from "../queue/redis.js"

const DEDUP_TTL = 86400 // 24 hours

/**
 * Returns true if this message has already been processed (duplicate).
 */
export async function isDuplicate(messageId: string): Promise<boolean> {
  const redis = getRedis()
  const key = `dedup:msg:${messageId}`
  const result = await redis.set(key, "1", "EX", DEDUP_TTL, "NX")
  return result !== "OK" // NX returns null if key already exists
}
