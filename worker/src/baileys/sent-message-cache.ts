/**
 * Short-lived in-memory cache of message IDs sent by the worker via the outbound queue.
 * Used to avoid double-saving in event-handlers when Baileys reflects our own messages
 * back as `fromMe: true` — those are already saved by the API route that triggered the send.
 */

const cache = new Map<string, number>() // msgId → expiresAtMs
const TTL_MS = 60_000

export function markSentByUs(msgId: string): void {
  cache.set(msgId, Date.now() + TTL_MS)
  // Lazy cleanup: prune expired entries to avoid unbounded growth
  if (cache.size > 500) {
    const now = Date.now()
    for (const [id, exp] of cache) {
      if (now > exp) cache.delete(id)
    }
  }
}

export function wasSentByUs(msgId: string): boolean {
  const exp = cache.get(msgId)
  if (!exp) return false
  if (Date.now() > exp) {
    cache.delete(msgId)
    return false
  }
  return true
}
