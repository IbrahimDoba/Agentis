import crypto from "node:crypto"
import { config } from "../config.js"

// Verifies a short-lived SSE "stream ticket" minted by the Next.js app
// (src/lib/stream-token.ts). Format: `<base64url(payload)>.<base64url(hmac)>`
// where payload = { a: agentId, u: userId, e: expiryUnixSeconds }, signed with
// HMAC-SHA256 over the encoded payload using the shared STREAM_TOKEN_SECRET.
// Returns the claims on success, or null if the secret is unset, the signature
// doesn't match, the token is malformed, or it has expired.
export function verifyStreamToken(token: string): { agentId: string; userId: string } | null {
  const secret = config.STREAM_TOKEN_SECRET
  if (!secret) return null

  const dot = token.indexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    if (typeof p.a !== "string" || typeof p.u !== "string" || typeof p.e !== "number") return null
    if (p.e < Math.floor(Date.now() / 1000)) return null
    return { agentId: p.a, userId: p.u }
  } catch {
    return null
  }
}
