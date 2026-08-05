import { db } from "@/lib/db"
import { mapWithConcurrency } from "@/lib/concurrency"
import { emailBrandOf } from "@/lib/tenant"
import { sendAppointmentReminderEmail, sendAppointmentBookedEmail, type EmailBrand } from "@/lib/email"

// Cap per run so one scan can't fan out to an unbounded email burst.
const MAX_PER_RUN = 200
const EMAIL_CONCURRENCY = 5
// Only look at appointments starting within this window — bounds the scan and
// matches the largest reminder lead time the UI allows (1 week + a day buffer).
const MAX_LEAD_WINDOW_MS = 8 * 24 * 60 * 60 * 1000
// The "booked" scan only emails appointments created this recently, so a first
// run (or a run after downtime) can't blast a backlog of old bookings.
const BOOKED_LOOKBACK_MS = 60 * 60 * 1000 // 1h

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in appointment-reminders-job.test.ts)
// ---------------------------------------------------------------------------

export interface ReminderRow {
  scheduledAt: Date
  reminder1Minutes: number
  reminder1SentAt: Date | null
  reminder2Minutes: number | null
  reminder2SentAt: Date | null
}

// Which reminder stages are due to send for this appointment right now: a stage
// is due when it hasn't been sent, its lead time has arrived, and the
// appointment is still upcoming (never remind about something already started).
export function dueStages(a: ReminderRow, now: Date): Array<{ stage: 1 | 2; minutes: number }> {
  const out: Array<{ stage: 1 | 2; minutes: number }> = []
  const nowMs = now.getTime()
  const schedMs = a.scheduledAt.getTime()
  if (schedMs <= nowMs) return out
  if (a.reminder1SentAt == null && nowMs >= schedMs - a.reminder1Minutes * 60_000) {
    out.push({ stage: 1, minutes: a.reminder1Minutes })
  }
  if (a.reminder2SentAt == null && a.reminder2Minutes != null && nowMs >= schedMs - a.reminder2Minutes * 60_000) {
    out.push({ stage: 2, minutes: a.reminder2Minutes })
  }
  return out
}

// Human phrase for how far out the appointment is, from minutes remaining.
export function leadLabel(minutesRemaining: number): string {
  const m = Math.max(1, Math.round(minutesRemaining))
  if (m < 60) return `in ${m} minute${m === 1 ? "" : "s"}`
  const hours = Math.round(m / 60)
  if (hours < 24) return hours === 1 ? "in about 1 hour" : `in about ${hours} hours`
  const days = Math.round(hours / 24)
  return days === 1 ? "in about 1 day" : `in about ${days} days`
}

// Absolute date/time label in the business timezone (WAT — Nigeria, no DST).
export function whenLabel(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: "Africa/Lagos",
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  })
}

// ---------------------------------------------------------------------------
// Recipients — owner + accepted team members, plus each owner's email brand.
// Shared by the reminder and "booked" scans. One batched query per relation.
// ---------------------------------------------------------------------------

interface Recipient { email: string; name: string | null }

async function loadRecipients(ownerIds: string[]) {
  const ids = [...new Set(ownerIds)]
  const [owners, members] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, resellerId: true } }),
    db.workspaceMember.findMany({
      where: { workspaceId: { in: ids }, status: "ACCEPTED" },
      select: { workspaceId: true, email: true, user: { select: { name: true } } },
    }),
  ])
  const ownerById = new Map(owners.map((o) => [o.id, o]))
  const membersByOwner = new Map<string, Recipient[]>()
  for (const m of members) {
    const arr = membersByOwner.get(m.workspaceId) ?? []
    arr.push({ email: m.email, name: m.user?.name ?? null })
    membersByOwner.set(m.workspaceId, arr)
  }
  const resellers = await db.reseller.findMany({ where: { id: { in: [...new Set(owners.map((o) => o.resellerId))] } } })
  const resellerById = new Map(resellers.map((r) => [r.id, r]))
  const brandFor = (resellerId: string): EmailBrand | undefined => emailBrandOf(resellerById.get(resellerId) ?? null)

  // owner + team, deduped, for a given workspace owner id.
  const recipientsFor = (ownerId: string): { owner: (typeof owners)[number]; list: Recipient[] } | null => {
    const owner = ownerById.get(ownerId)
    if (!owner) return null
    return { owner, list: [{ email: owner.email, name: owner.name }, ...(membersByOwner.get(ownerId) ?? [])] }
  }
  return { recipientsFor, brandFor }
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export interface ReminderSummary {
  remindersSent: number    // stages successfully claimed + emailed to ≥1 recipient
  emailsSent: number       // individual recipient emails delivered
  errors: Array<{ appointmentId: string; stage: number; message: string }>
}

export async function runAppointmentReminders(now: Date = new Date()): Promise<ReminderSummary> {
  const summary: ReminderSummary = { remindersSent: 0, emailsSent: 0, errors: [] }
  const windowEnd = new Date(now.getTime() + MAX_LEAD_WINDOW_MS)

  // Upcoming, still-scheduled appointments with at least one unsent reminder.
  const appts = await db.appointment.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gt: now, lte: windowEnd },
      OR: [{ reminder1SentAt: null }, { reminder2SentAt: null }],
    },
    select: {
      id: true, userId: true, agentId: true,
      title: true, notes: true, customerName: true, customerNumber: true,
      scheduledAt: true,
      reminder1Minutes: true, reminder1SentAt: true,
      reminder2Minutes: true, reminder2SentAt: true,
      agent: { select: { businessName: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: MAX_PER_RUN,
  })

  // Flatten to (appointment, due-stage) tasks. Skip appointments with nothing due.
  const tasks = appts.flatMap((a) => dueStages(a, now).map((s) => ({ appt: a, ...s })))
  if (tasks.length === 0) return summary

  const { recipientsFor, brandFor } = await loadRecipients(tasks.map((t) => t.appt.userId))

  await mapWithConcurrency(tasks, EMAIL_CONCURRENCY, async ({ appt, stage }) => {
    const rcpt = recipientsFor(appt.userId)
    if (!rcpt) return

    // Atomically claim this stage BEFORE sending — a guarded update so two
    // overlapping cron runs can't both email the same reminder. If the claim
    // touches 0 rows, another run already took it.
    const stampField = stage === 1 ? "reminder1SentAt" : "reminder2SentAt"
    const claim = await db.appointment.updateMany({
      where: { id: appt.id, [stampField]: null },
      data: { [stampField]: now },
    })
    if (claim.count === 0) return

    // Label from the ACTUAL remaining time (the cron may fire a little after the
    // exact lead moment), not the configured lead minutes.
    const remainingMin = (appt.scheduledAt.getTime() - now.getTime()) / 60_000
    const brand = brandFor(rcpt.owner.resellerId)

    let anyDelivered = false
    for (const r of rcpt.list) {
      try {
        await sendAppointmentReminderEmail(
          {
            recipientName: r.name,
            email: r.email,
            agentName: appt.agent.businessName,
            title: appt.title,
            whenLabel: whenLabel(appt.scheduledAt),
            leadLabel: leadLabel(remainingMin),
            customerName: appt.customerName,
            customerNumber: appt.customerNumber,
            notes: appt.notes,
          },
          brand,
        )
        anyDelivered = true
        summary.emailsSent++
      } catch (err) {
        // The stage was already claimed (stamped) above, so this recipient
        // won't be retried — log it so a Resend outage is diagnosable.
        console.error("[appointment-reminders] send failed", { appointmentId: appt.id, stage, to: r.email }, err)
        summary.errors.push({
          appointmentId: appt.id,
          stage,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    if (anyDelivered) summary.remindersSent++
  })

  return summary
}

// ---------------------------------------------------------------------------
// "Booked" notifications — an instant email the moment an appointment is created
// (by the AI or a human), before any reminders.
// ---------------------------------------------------------------------------

export interface BookedSummary {
  bookedSent: number   // appointments successfully claimed + emailed to ≥1 recipient
  emailsSent: number
  errors: Array<{ appointmentId: string; message: string }>
}

export async function runAppointmentBookedNotifications(now: Date = new Date()): Promise<BookedSummary> {
  const summary: BookedSummary = { bookedSent: 0, emailsSent: 0, errors: [] }
  const since = new Date(now.getTime() - BOOKED_LOOKBACK_MS)

  // Freshly-created appointments not yet announced. The lookback stops a first
  // run from blasting a backlog; a still-upcoming filter avoids emailing about
  // one booked for a time already past.
  const appts = await db.appointment.findMany({
    where: {
      bookedNotifiedAt: null,
      createdAt: { gte: since },
      status: "SCHEDULED",
      scheduledAt: { gt: now },
    },
    select: {
      id: true, userId: true, createdBy: true,
      title: true, notes: true, customerName: true, customerNumber: true,
      scheduledAt: true,
      agent: { select: { businessName: true } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PER_RUN,
  })
  if (appts.length === 0) return summary

  const { recipientsFor, brandFor } = await loadRecipients(appts.map((a) => a.userId))

  await mapWithConcurrency(appts, EMAIL_CONCURRENCY, async (appt) => {
    const rcpt = recipientsFor(appt.userId)
    if (!rcpt) return

    // Claim before sending so overlapping runs can't double-announce.
    const claim = await db.appointment.updateMany({
      where: { id: appt.id, bookedNotifiedAt: null },
      data: { bookedNotifiedAt: now },
    })
    if (claim.count === 0) return

    const brand = brandFor(rcpt.owner.resellerId)
    let anyDelivered = false
    for (const r of rcpt.list) {
      try {
        await sendAppointmentBookedEmail(
          {
            recipientName: r.name,
            email: r.email,
            agentName: appt.agent.businessName,
            title: appt.title,
            whenLabel: whenLabel(appt.scheduledAt),
            bookedBy: appt.createdBy === "human" ? "human" : "ai",
            customerName: appt.customerName,
            customerNumber: appt.customerNumber,
            notes: appt.notes,
          },
          brand,
        )
        anyDelivered = true
        summary.emailsSent++
      } catch (err) {
        console.error("[appointment-booked] send failed", { appointmentId: appt.id, to: r.email }, err)
        summary.errors.push({ appointmentId: appt.id, message: err instanceof Error ? err.message : String(err) })
      }
    }
    if (anyDelivered) summary.bookedSent++
  })

  return summary
}
