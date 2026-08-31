import { createHmac, timingSafeEqual } from "node:crypto"

// Stateless unsubscribe tokens for the newsletter.
//
// Cold outreach messages carry a random per-message token stored on the row.
// NewsletterSubscriber has no such column, and adding one would mean
// backfilling every existing subscriber before the link could work. A signed
// token needs neither: the address travels inside it and the signature is what
// makes it unforgeable, so a stranger cannot unsubscribe someone else.

const PREFIX = "n"

function secret(): string {
  // Falls back to NEXTAUTH_SECRET so this works in every environment that can
  // already sign a session, rather than silently emitting unverifiable links.
  const value = process.env.OUTREACH_UNSUB_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!value) throw new Error("OUTREACH_UNSUB_SECRET or NEXTAUTH_SECRET must be set")
  return value
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 32)
}

export function newsletterUnsubToken(email: string): string {
  const payload = Buffer.from(email.toLowerCase()).toString("base64url")
  return `${PREFIX}.${payload}.${sign(payload)}`
}

/** Returns the email a newsletter token was issued for, or null if it is not valid. */
export function verifyNewsletterUnsubToken(token: string): string | null {
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== PREFIX) return null

  const [, payload, signature] = parts
  const expected = sign(payload)
  // Constant-time compare, and length-checked first because timingSafeEqual
  // throws on mismatched lengths rather than returning false.
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  try {
    const email = Buffer.from(payload, "base64url").toString("utf8").toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  } catch {
    return null
  }
}

export function isNewsletterToken(token: string): boolean {
  return token.startsWith(`${PREFIX}.`)
}
