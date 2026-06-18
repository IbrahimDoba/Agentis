import { getRedis } from "../queue/redis.js"
import { createHash } from "crypto"

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

// Replay guard that does NOT depend on a stable WhatsApp messageId. Baileys
// redelivers recent inbound messages after a reconnect (our sessions flap —
// see error.md / UPDATE_SUMMARY.md), and the messageId dedup above can miss a
// replay if WhatsApp didn't carry a key.id (the worker then has to derive one).
// Keying on (agent, sender, text) within a short window means the SAME customer
// message can't spawn two AI turns even if it arrives twice under two ids.
//
// Window is deliberately short: long enough to swallow reconnect redeliveries
// (which arrive within seconds), short enough that a customer who genuinely
// re-sends the same text a minute later still gets a reply. Tune via the const.
const CONTENT_DEDUP_TTL = 60 // seconds

export async function isDuplicateContent(
  agentId: string,
  senderJid: string,
  text: string
): Promise<boolean> {
  const redis = getRedis()
  const hash = createHash("sha1").update(text).digest("hex").slice(0, 16)
  const key = `dedup:content:${agentId}:${senderJid}:${hash}`
  const result = await redis.set(key, "1", "EX", CONTENT_DEDUP_TTL, "NX")
  return result !== "OK"
}
