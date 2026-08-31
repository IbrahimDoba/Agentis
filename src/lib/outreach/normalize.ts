import { createHash } from "node:crypto"

// Pure normalization for imported prospect rows. No db imports — a VA-built
// spreadsheet is messy in predictable ways, and every one of those ways is
// cheaper to fix here than to discover at send time.

// Gmail-style plus tags and dots are the same mailbox; other providers treat
// dots as significant, so only the tag is stripped universally.
const GMAIL_HOSTS = new Set(["gmail.com", "googlemail.com"])

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  // One @ exactly, a dot in the host, and no whitespace. Deliberately stricter
  // than RFC 5321 — an address we cannot confidently parse is one we should not
  // be cold-emailing anyway.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null

  const [local, host] = trimmed.split("@")
  const untagged = local.split("+")[0]
  if (!untagged) return null

  const canonical = GMAIL_HOSTS.has(host) ? untagged.replace(/\./g, "") : untagged
  return `${canonical}@${host}`
}

export function emailDomain(email: string): string {
  return email.slice(email.indexOf("@") + 1)
}

export function hashEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex")
}

// Nigerian mobile numbers arrive as 08031234567, 8031234567, +2348031234567 and
// 2348031234567 in roughly equal measure. Everything becomes E.164.
export function normalizeNgPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null

  let national: string
  if (digits.startsWith("234")) national = digits.slice(3)
  else if (digits.startsWith("0")) national = digits.slice(1)
  else national = digits

  // Every NG mobile network code is 10 digits national, starting 7, 8 or 9.
  if (!/^[789]\d{9}$/.test(national)) return null
  return `+234${national}`
}

export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (!url.hostname.includes(".")) return null
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase()
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

export function normalizeInstagram(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Accepts @handle, handle, and any instagram.com/handle URL form.
  const handle = trimmed
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?]/)[0]
    .toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null
}

// The demo URL is public and shown to the prospect, so the slug has to read as
// their business, not as a cuid. Collisions are resolved by the caller against
// the unique index rather than by pre-emptively appending entropy to every row.
export function demoSlug(businessName: string, suffix?: string): string {
  const base = businessName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "")
  const stem = base || "business"
  return suffix ? `${stem}-${suffix}` : stem
}

export function titleCase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}
