import { db } from "@/lib/db"
import { assertSendable } from "./suppression"
import { renderOutreachEmail } from "./render"
import { warmupStage, parseWarmupStart } from "./warmup"
import { deliver, transportName } from "./transport"
import { allowedNow, nextGapMs, sleep, HOURLY_CAP } from "./pacing"

// Cold sending, deliberately isolated from src/lib/email.ts.
//
// That module hardcodes noreply@dailzero.com for all 26 transactional templates
// — verification codes, password resets, receipts, lead alerts. Cold email
// routinely runs 0.5-1% spam complaints against a 0.3% enforced ceiling, and a
// reputation hit is a SILENT failure: nothing bounces, signups just quietly
// stop completing because the verification code (10-minute expiry) landed in
// spam.
//
// This pilot deliberately sends from the ROOT domain over Zoho, which means the
// campaign and those transactional emails share a DKIM identity and therefore a
// domain reputation. The sending IPs stay separate (Zoho vs Amazon SES), but the
// domain does not. That was an accepted tradeoff, so the controls that remain —
// low caps, the warmup ramp, pacing, and halting on the first hard bounce — are
// load-bearing rather than belt-and-braces. See src/lib/outreach/README.md.

const ROOT_DOMAIN = "dailzero.com"

const FROM_EMAIL = process.env.OUTREACH_FROM_EMAIL
const FROM_NAME = process.env.OUTREACH_FROM_NAME ?? "Dailzero"
const REPLY_TO = process.env.OUTREACH_REPLY_TO ?? FROM_EMAIL

// The From name is the brand; the signature is the person behind it. Kept
// separate because they answer different questions for the reader: who is this
// from, and who am I replying to.
const SIGNER_NAME = process.env.OUTREACH_SIGNER_NAME ?? "Ibrahim Doba"
const SIGNER_TITLE = process.env.OUTREACH_SIGNER_TITLE ?? "CEO, Dailzero"
const SIGN_OFF = `${SIGNER_NAME}\n${SIGNER_TITLE}\n${FROM_EMAIL ?? ""}`.trim()

// Steady-state ceiling once warmup finishes. Stays low because the pilot is 200
// prospects and volume buys nothing but risk.
export const DAILY_SEND_CAP = Number(process.env.OUTREACH_DAILY_CAP ?? 30)

export const WARMUP_STARTED_AT = parseWarmupStart(process.env.OUTREACH_WARMUP_STARTED_AT)

/**
 * The cap actually in force today: the lower of the configured ceiling and the
 * warmup ramp. Every send path goes through this rather than DAILY_SEND_CAP, so
 * a forgotten env var cannot open the taps on a cold subdomain.
 */
export function effectiveDailyCap(now = new Date()): number {
  return warmupStage(WARMUP_STARTED_AT, DAILY_SEND_CAP, now).cap
}

export function warmupStatus(now = new Date()) {
  const stage = warmupStage(WARMUP_STARTED_AT, DAILY_SEND_CAP, now)
  return { ...stage, configured: WARMUP_STARTED_AT !== null, fullCap: DAILY_SEND_CAP }
}

/**
 * Refuses to run unless a sending identity is configured.
 *
 * Sending cold from the root is allowed, but only behind an explicit
 * OUTREACH_ALLOW_ROOT_DOMAIN opt-in. The flag exists so the decision stays
 * deliberate and legible in config: without it, a future deploy that happens to
 * set OUTREACH_FROM_EMAIL to a root mailbox would silently put the campaign on
 * the same reputation as every verification code.
 */
export function assertOutreachConfigured(): string {
  if (!FROM_EMAIL) {
    throw new Error("OUTREACH_FROM_EMAIL is not set — refusing to send cold email")
  }

  const host = FROM_EMAIL.slice(FROM_EMAIL.indexOf("@") + 1).toLowerCase()
  if (!host.includes(".")) {
    throw new Error(`OUTREACH_FROM_EMAIL has no valid domain: ${FROM_EMAIL}`)
  }
  if (isRootSender() && process.env.OUTREACH_ALLOW_ROOT_DOMAIN !== "true") {
    throw new Error(
      `OUTREACH_FROM_EMAIL is on ${ROOT_DOMAIN} itself, which also sends every verification ` +
        `code and password reset. Set OUTREACH_ALLOW_ROOT_DOMAIN=true to accept that, or use ` +
        `a subdomain such as ope@go.${ROOT_DOMAIN}.`
    )
  }
  // noreply@ is email.ts's transactional sender. Borrowing it would put cold
  // replies into a mailbox nobody reads and confuse the two streams entirely.
  if (FROM_EMAIL.toLowerCase().startsWith("noreply@")) {
    throw new Error("OUTREACH_FROM_EMAIL must not be noreply@ — cold mail needs a real, monitored mailbox")
  }
  if (transportName() === "zoho-smtp") {
    for (const key of ["OUTREACH_SMTP_HOST", "OUTREACH_SMTP_USER", "OUTREACH_SMTP_PASSWORD"]) {
      if (!process.env[key]) throw new Error(`${key} is required for the zoho-smtp transport`)
    }
  }
  return FROM_EMAIL
}

/** True when sending from the bare root domain rather than a subdomain. */
export function isRootSender(): boolean {
  if (!FROM_EMAIL) return false
  const host = FROM_EMAIL.slice(FROM_EMAIL.indexOf("@") + 1).toLowerCase()
  return host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`
}

/** True when sending from a subdomain of the root rather than a separate domain. */
export function isSubdomainSender(): boolean {
  if (!FROM_EMAIL) return false
  return FROM_EMAIL.toLowerCase().endsWith(`.${ROOT_DOMAIN}`)
}

export type SendOutcome =
  | { status: "sent"; providerMessageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string }

/**
 * Sends one approved message. Claims the row with a guarded update first, so
 * two overlapping callers cannot both send it — the same pattern the reseller
 * credit pool uses to avoid overdrawing.
 */
export async function sendOutreachMessage(messageId: string): Promise<SendOutcome> {
  const from = assertOutreachConfigured()

  const claimed = await db.outreachMessage.updateMany({
    where: { id: messageId, status: "approved" },
    data: { status: "sending" },
  })
  if (claimed.count === 0) return { status: "skipped", reason: "not in approved state" }

  const message = await db.outreachMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      prospectId: true,
      toEmail: true,
      subject: true,
      bodyText: true,
      token: true,
      prospect: { select: { contactName: true } },
    },
  })
  if (!message) return { status: "skipped", reason: "message vanished mid-claim" }

  // Final gate. An unsubscribe can land between approval and send, and
  // honouring it late is the entire point of having the field.
  const gate = await assertSendable(message.prospectId)
  if (!gate.sendable) {
    await db.outreachMessage.update({
      where: { id: message.id },
      data: { status: "skipped", error: gate.reason },
    })
    return { status: "skipped", reason: gate.reason }
  }

  const rendered = renderOutreachEmail({
    subject: message.subject,
    body: message.bodyText,
    signOff: SIGN_OFF,
    token: message.token,
    htmlPart: process.env.OUTREACH_HTML !== "false",
  })

  try {
    const providerMessageId = await deliver({
      from,
      fromName: FROM_NAME,
      replyTo: REPLY_TO ?? from,
      to: message.toEmail,
      email: rendered,
    })

    const sentAt = new Date()
    await db.$transaction([
      db.outreachMessage.update({
        where: { id: message.id },
        data: { status: "sent", sentAt, providerMessageId: providerMessageId || null, error: null },
      }),
      db.outreachProspect.update({
        where: { id: message.prospectId },
        data: { status: "sent" },
      }),
    ])
    return { status: "sent", providerMessageId }
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err)
    // Persisted rather than swallowed: admin/newsletter/send drops per-recipient
    // failures into a console log, which is how you find out a week late.
    await db.outreachMessage.update({
      where: { id: message.id },
      data: { status: "failed", error: errorText.slice(0, 500) },
    })
    return { status: "failed", error: errorText }
  }
}

/**
 * Releases one slice of the approved queue, oldest first, with a randomised gap
 * between each send.
 *
 * A slice rather than the whole day's allowance because the gaps make a full run
 * far longer than a request may live — the caller is a cron that fires every ten
 * minutes, so the drip continues across invocations instead of inside one.
 */
export async function sendApprovedBatch(limit?: number) {
  const allowed = allowedNow({
    sentToday: await sentToday(),
    sentLastHour: await sentLastHour(),
    dailyCap: effectiveDailyCap(),
    sliceSize: limit,
  })
  if (allowed === 0) {
    return { attempted: 0, sent: 0, skipped: 0, failed: 0, capReached: true }
  }

  const queue = await db.outreachMessage.findMany({
    where: { status: "approved" },
    orderBy: { createdAt: "asc" },
    take: allowed,
    select: { id: true },
  })

  const counts = { attempted: 0, sent: 0, skipped: 0, failed: 0, capReached: false }
  // Serial, not Promise.all. Pacing is the feature here, which is the opposite
  // of what the newsletter route wants and why this does not reuse it.
  for (const [index, { id }] of queue.entries()) {
    // Gap before each send except the first: the previous invocation already
    // spaced us, and an opening sleep would waste request time doing nothing.
    if (index > 0) await sleep(nextGapMs())

    counts.attempted++
    const outcome = await sendOutreachMessage(id)
    counts[outcome.status === "sent" ? "sent" : outcome.status === "skipped" ? "skipped" : "failed"]++

    // A transport failure is usually the provider throttling or refusing us.
    // Continuing into it is how a warning becomes a block, so stop the slice.
    if (outcome.status === "failed") break
  }
  return counts
}

export async function sentToday(): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  return db.outreachMessage.count({ where: { status: "sent", sentAt: { gte: startOfDay } } })
}

/** Rolling hour, matching how the provider's own limit is measured. */
export async function sentLastHour(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000)
  return db.outreachMessage.count({ where: { status: "sent", sentAt: { gte: since } } })
}

export { HOURLY_CAP }
