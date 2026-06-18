import { getRedis } from "../queue/redis.js"
import { createHash } from "crypto"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "inbound-dedup" })

// How long the same (agent, sender, text) is treated as a replay of one
// message. WhatsApp redelivers messages on reconnect — once live as "notify"
// and again as "append"/history — and a flapping session (justfits) can refire
// the same customer message seconds to a couple minutes apart. Those copies can
// land with different/derived message ids, so id-based dedup downstream misses
// them and the customer gets two AI replies. Keying on the message CONTENT here
// catches the replay no matter what id it carries. Long enough to swallow a
// reconnect redelivery; short enough that a customer genuinely re-sending the
// same text later still gets through. Tune via this constant.
const REPLAY_TTL = 120 // seconds

function contentKey(agentId: string, senderJid: string, text: string): string {
  const h = createHash("sha1").update(`${agentId}|${senderJid}|${text}`).digest("hex").slice(0, 16)
  return `fwd:dedup:${agentId}:${senderJid}:${h}`
}

// Claim this inbound message for forwarding. Returns true if we got the claim
// (caller should forward), false if the same (agent, sender, text) was already
// claimed within REPLAY_TTL (caller should skip the duplicate). Atomic via
// SET NX. Fail-open: a Redis blip must never drop a real customer message, so
// on error we return true (forward and let the orchestrator's dedup decide).
export async function claimInboundForForward(
  agentId: string,
  senderJid: string,
  text: string
): Promise<boolean> {
  try {
    const redis = getRedis()
    const res = await redis.set(contentKey(agentId, senderJid, text), "1", "EX", REPLAY_TTL, "NX")
    return res === "OK"
  } catch (err) {
    logger.warn({ err, agentId }, "Inbound dedup check failed — forwarding anyway (fail-open)")
    return true
  }
}

// Release a claim so a redelivery can retry. Call this when the forward itself
// fails, so a transient orchestrator error doesn't permanently swallow the
// message (the next redelivery is then free to forward it).
export async function releaseInboundClaim(
  agentId: string,
  senderJid: string,
  text: string
): Promise<void> {
  try {
    await getRedis().del(contentKey(agentId, senderJid, text))
  } catch {
    /* best-effort — the key expires on its own within REPLAY_TTL anyway */
  }
}
