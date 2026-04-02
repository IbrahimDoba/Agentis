import { NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"

/**
 * Verify ElevenLabs HMAC signature for both pre-call and post-call webhooks.
 *
 * ElevenLabs sends the signature in the header (checked in order):
 *   - elevenlabs-signature
 *   - xi-elevenlabs-signature
 *
 * Header format: "t=<timestamp>,v0=<hex_signature>"
 * Signed payload: "<timestamp>.<raw_body>"
 *
 * Returns true if signature is valid, or if no secret is configured (dev mode).
 */
export async function verifyElevenLabsSignature(
  req: NextRequest,
  body: string
): Promise<boolean> {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET
  if (!secret) {
    console.warn("[webhook-auth] ELEVENLABS_WEBHOOK_SECRET not set — skipping verification")
    return true // allow in dev when no secret is configured
  }

  // ElevenLabs has used both header names
  const sigHeader =
    req.headers.get("elevenlabs-signature") ??
    req.headers.get("xi-elevenlabs-signature")

  if (!sigHeader) {
    console.error("[webhook-auth] No signature header found in request")
    return false
  }

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const idx = p.indexOf("=")
      return [p.slice(0, idx), p.slice(idx + 1)]
    })
  )

  const timestamp = parts["t"]
  const signature = parts["v0"]
  if (!timestamp || !signature) {
    console.error("[webhook-auth] Signature header missing t or v0 components")
    return false
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")

  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    )
  } catch {
    console.error("[webhook-auth] Signature comparison failed (length mismatch?)")
    return false
  }
}
