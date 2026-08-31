import { db } from "@/lib/db"
import { emailDomain, hashEmail } from "./normalize"

// The only door into the send path. Called three times per prospect — at
// import, before the Claude call, and again inside the send — because the two
// failure modes here are both unrecoverable: cold-emailing an existing customer,
// and emailing someone who already told us to stop.

export type SuppressionScope = "email" | "domain" | "email_hash"

export type SendableCheck =
  | { sendable: true }
  | { sendable: false; reason: string }

// Free-mail hosts must never be domain-suppressed: one unsubscribe from a
// gmail.com address would otherwise silently blackhole most of a Nigerian SMB
// list, since gmail is where that market actually is.
const FREE_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "yandex.com",
  "mail.com",
])

export function isFreeMailHost(host: string): boolean {
  return FREE_MAIL_HOSTS.has(host.toLowerCase())
}

export async function suppress(
  scope: SuppressionScope,
  value: string,
  reason: string,
  note?: string
): Promise<void> {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return
  if (scope === "domain" && isFreeMailHost(normalized)) return

  // Upsert rather than create: a second complaint from the same address is a
  // no-op, not a unique-constraint crash inside a webhook handler.
  await db.outreachSuppression.upsert({
    where: { scope_value: { scope, value: normalized } },
    create: { scope, value: normalized, reason, note },
    update: {},
  })
}

/**
 * Every reason an address must not be contacted, in one query per source.
 * Returns null when the address is clear.
 */
export async function suppressionReason(email: string): Promise<string | null> {
  const normalized = email.toLowerCase()
  const host = emailDomain(normalized)

  const [suppression, existingUser, subscriber] = await Promise.all([
    db.outreachSuppression.findFirst({
      where: {
        OR: [
          { scope: "email", value: normalized },
          { scope: "domain", value: host },
          { scope: "email_hash", value: hashEmail(normalized) },
        ],
      },
      select: { reason: true, scope: true },
    }),
    // An existing customer receiving a cold pitch for the product they already
    // pay for is the single most embarrassing failure this system can produce.
    db.user.findFirst({
      where: { OR: [{ email: normalized }, { businessEmail: normalized }] },
      select: { id: true },
    }),
    db.newsletterSubscriber.findUnique({
      where: { email: normalized },
      select: { id: true },
    }),
  ])

  if (suppression) return `${suppression.reason} (${suppression.scope})`
  if (existingUser) return "already a Dailzero user"
  // Subscribers opted in to a different, warmer list. Mixing the two would
  // spend consent we were given for something else.
  if (subscriber) return "already a newsletter subscriber"
  return null
}

export async function isSuppressed(email: string): Promise<boolean> {
  return (await suppressionReason(email)) !== null
}

/**
 * The final gate, called inside the send after the row is claimed. Re-checks
 * rather than trusting the queued state: an unsubscribe can land between
 * approval and send, and honouring it late is the whole point of the field.
 */
export async function assertSendable(prospectId: string): Promise<SendableCheck> {
  const prospect = await db.outreachProspect.findUnique({
    where: { id: prospectId },
    select: {
      email: true,
      status: true,
      sourceUrl: true,
      sourceLabel: true,
    },
  })
  if (!prospect) return { sendable: false, reason: "prospect no longer exists" }

  if (prospect.status === "unsubscribed" || prospect.status === "bounced") {
    return { sendable: false, reason: `prospect status is ${prospect.status}` }
  }
  // Enforced here rather than only at import so a row hand-edited in the admin
  // UI can never produce an email with no "where I found you" sentence.
  if (!prospect.sourceUrl || !prospect.sourceLabel) {
    return { sendable: false, reason: "missing source disclosure" }
  }

  const reason = await suppressionReason(prospect.email)
  return reason ? { sendable: false, reason } : { sendable: true }
}

/**
 * Bulk pre-filter for CSV import. One query per source instead of one per row,
 * which matters at a few hundred rows and matters more at a few thousand.
 */
export async function filterSuppressed(emails: string[]): Promise<Set<string>> {
  const normalized = emails.map((e) => e.toLowerCase())
  if (normalized.length === 0) return new Set()

  const hosts = [...new Set(normalized.map(emailDomain))].filter((h) => !isFreeMailHost(h))
  const hashes = normalized.map(hashEmail)

  const [suppressions, users, subscribers] = await Promise.all([
    db.outreachSuppression.findMany({
      where: {
        OR: [
          { scope: "email", value: { in: normalized } },
          { scope: "domain", value: { in: hosts } },
          { scope: "email_hash", value: { in: hashes } },
        ],
      },
      select: { scope: true, value: true },
    }),
    db.user.findMany({
      where: { OR: [{ email: { in: normalized } }, { businessEmail: { in: normalized } }] },
      select: { email: true, businessEmail: true },
    }),
    db.newsletterSubscriber.findMany({
      where: { email: { in: normalized } },
      select: { email: true },
    }),
  ])

  const byEmail = new Set<string>()
  const byDomain = new Set<string>()
  const byHash = new Set<string>()
  for (const s of suppressions) {
    if (s.scope === "email") byEmail.add(s.value)
    else if (s.scope === "domain") byDomain.add(s.value)
    else byHash.add(s.value)
  }
  for (const u of users) {
    if (u.email) byEmail.add(u.email.toLowerCase())
    if (u.businessEmail) byEmail.add(u.businessEmail.toLowerCase())
  }
  for (const s of subscribers) byEmail.add(s.email.toLowerCase())

  return new Set(
    normalized.filter(
      (e) => byEmail.has(e) || byDomain.has(emailDomain(e)) || byHash.has(hashEmail(e))
    )
  )
}
