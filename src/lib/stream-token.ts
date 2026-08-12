import crypto from "node:crypto"

// Mints a short-lived SSE "stream ticket" the browser presents to the
// orchestrator's /v1/stream route (verified there by
// orchestrator/src/lib/stream-token.ts). Format:
//   `<base64url(payload)>.<base64url(hmac-sha256(payload))>`
// payload = { a: agentId, u: userId, e: expiryUnixSeconds }.
//
// The ticket only authorizes OPENING the stream; once connected the orchestrator
// keeps streaming regardless of expiry, so a short TTL is fine — a reconnect
// mints a fresh one.
const TTL_SECONDS = 300

export function mintStreamToken(agentId: string, userId: string): string {
  const secret = process.env.STREAM_TOKEN_SECRET
  if (!secret) throw new Error("STREAM_TOKEN_SECRET is not set")

  const payload = { a: agentId, u: userId, e: Math.floor(Date.now() / 1000) + TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}
