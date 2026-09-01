import OpenAI from "openai"
import { db } from "@/lib/db"
import { mapWithConcurrency } from "@/lib/concurrency"
import { emailBrandOf } from "@/lib/tenant"
import { sendAppointmentReminderEmail, sendAppointmentBookedEmail, type EmailBrand } from "@/lib/email"
import { baileysClient } from "@/lib/baileys-client"
import { sendAppointmentReminderWhatsapp } from "@/lib/lead-whatsapp"
import { normalizePhone } from "@/lib/phone"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Cap per run so one scan can't fan out to an unbounded email burst.
const MAX_PER_RUN = 200
const EMAIL_CONCURRENCY = 5
// How many recent messages to feed the WhatsApp reminder generator for context.
const REMINDER_CONTEXT_MESSAGES = 14
const REMINDER_MODEL = "gpt-4o-mini"
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

// Two phone numbers are the "same line" ignoring formatting (spaces, +, leading
// zeros, country-code prefix). Used to stop the owner's WhatsApp alert from being
// addressed to the agent's own business line — a session can't message itself.
export function sameNumber(a?: string | null, b?: string | null): boolean {
  const norm = (s?: string | null) => normalizePhone(s).replace(/^0+/, "")
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}

// ---------------------------------------------------------------------------
// Recipients — owner + accepted team members, plus each owner's email brand.
// Shared by the reminder and "booked" scans. One batched query per relation.
// ---------------------------------------------------------------------------

interface Recipient { email: string; name: string | null }

async function loadRecipients(ownerIds: string[]) {
  const ids = [...new Set(ownerIds)]
  const [owners, members] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, name: true, email: true, resellerId: true,
        whatsappNotificationsEnabled: true, notifyWhatsappNumber: true,
      },
    }),
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
// WhatsApp reminder to the CUSTOMER — an AI-written, chat-aware nudge sent into
// the same conversation the appointment was booked in. Separate from the
// owner/team email above; for a due stage BOTH fire. Only chat-linked
// appointments (a conversationId + a customer number) can get one — a purely
// manual appointment has no thread to post into.
// ---------------------------------------------------------------------------

interface WaReminderAppt {
  agentId: string
  conversationId: string
  customerNumber: string
  customerName: string | null
  title: string
  notes: string | null
  scheduledAt: Date
  agent: { businessName: string; businessDescription: string | null }
}

// Ask the model for a short reminder in the business's voice, grounded in the
// recent transcript. Returns the text + token counts (so the send can be metered
// on real usage) or null if generation failed — the caller then skips the nudge.
async function generateWaReminder(
  appt: WaReminderAppt,
  transcript: string,
  lead: string,
  when: string,
): Promise<{ message: string; tokensInput: number; tokensOutput: number } | null> {
  const business = [appt.agent.businessName, appt.agent.businessDescription].filter(Boolean).join(" — ")
  const prompt = `You are the WhatsApp assistant for this business, sending a short appointment reminder to a customer you have already been chatting with.

Business: ${business}
Customer: ${appt.customerName ?? "Unknown"}
Appointment: ${appt.title}
When: ${when} (${lead})
${appt.notes ? `Notes: ${appt.notes}\n` : ""}Recent conversation:
${transcript || "(no earlier messages)"}

Write a friendly, natural WhatsApp reminder (1-2 sentences) that:
- Reminds them of the appointment (${appt.title}) and the time (${when})
- Uses their first name if known and matches the tone of the chat above
- Sounds like a real person from the business, not a bot — no placeholders like [name]

Respond ONLY with valid JSON: {"message": "the reminder text"}`

  try {
    const res = await openai.chat.completions.create({
      model: REMINDER_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 200,
    })
    const raw = res.choices[0]?.message?.content
    if (!raw) return null
    const message = (JSON.parse(raw) as { message?: string }).message?.trim()
    if (!message) return null
    return {
      message,
      tokensInput: res.usage?.prompt_tokens ?? 0,
      tokensOutput: res.usage?.completion_tokens ?? 0,
    }
  } catch (err) {
    console.error("[appointment-reminders] wa generation failed", { conversationId: appt.conversationId }, err)
    return null
  }
}

// A manual appointment (booked in the dashboard, not from a chat) has no
// conversationId, so there's no thread to persist/meter the customer reminder
// in. Find-or-create the conversation for this agent+number — deduped by the
// @@unique([agentId, phoneNumber]) — so the reminder threads into (and shows in)
// the same place any future chat with this customer would.
async function resolveCustomerConversationId(
  appt: { conversationId: string | null; agentId: string; customerNumber: string; customerName: string | null },
): Promise<string | null> {
  if (appt.conversationId) return appt.conversationId
  // Key on digits only. A dashboard-typed "+234 802 792 9743" and the same
  // customer's real thread ("2348027929743") must resolve to ONE conversation.
  const phoneNumber = normalizePhone(appt.customerNumber)
  if (!phoneNumber) return null
  const convo = await db.conversation.upsert({
    where: {
      agentId_phoneNumber_channel: { agentId: appt.agentId, phoneNumber, channel: "whatsapp" },
    },
    update: {},
    create: {
      agentId: appt.agentId,
      phoneNumber,
      channel: "whatsapp",
      contactName: appt.customerName,
    },
    select: { id: true },
  })
  return convo.id
}

// Generate → persist → send the customer's WhatsApp reminder. The Message row is
// written BEFORE the send (carrying its id) so the outbound queue can meter it,
// pace it, and delete it if a human takes over mid-send — the same contract the
// live reply path uses. If the send can't even be queued we drop the orphan row
// so a never-delivered reminder doesn't linger in the thread. Returns false when
// generation failed; the caller counts that as a failed nudge rather than
// silently treating the stage as done.
async function sendWaReminder(appt: WaReminderAppt, remainingMin: number): Promise<boolean> {
  // Address the conversation's real routing JID when known — the same target the
  // live reply path uses. A bare phone would be naively turned into
  // "<phone>@s.whatsapp.net" by the worker, which doesn't reliably reach
  // LID-addressed contacts; senderJid does. Fall back to the phone otherwise.
  const convo = await db.conversation.findUnique({
    where: { id: appt.conversationId },
    select: { senderJid: true, phoneNumber: true },
  })
  const to = convo?.senderJid || normalizePhone(convo?.phoneNumber || appt.customerNumber)

  const recent = await db.message.findMany({
    where: { conversationId: appt.conversationId },
    orderBy: { createdAt: "desc" },
    take: REMINDER_CONTEXT_MESSAGES,
    select: { direction: true, content: true },
  })
  const transcript = recent
    .reverse()
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Business"}: ${m.content}`)
    .join("\n")

  const gen = await generateWaReminder(appt, transcript, leadLabel(remainingMin), whenLabel(appt.scheduledAt))
  if (!gen) return false

  const msg = await db.message.create({
    data: {
      conversationId: appt.conversationId,
      direction: "outbound",
      senderRole: "ai",
      content: gen.message,
      tokensInput: gen.tokensInput,
      tokensOutput: gen.tokensOutput,
      modelUsed: REMINDER_MODEL,
    },
    select: { id: true },
  })

  try {
    await baileysClient.sendMessage({
      agentId: appt.agentId,
      to,
      text: gen.message,
      conversationId: appt.conversationId,
      source: "ai",
      messageId: msg.id,
      tokensInput: gen.tokensInput,
      tokensOutput: gen.tokensOutput,
      // Fires on a schedule, so the queue's "a human answered first" abort must
      // not swallow it — a chat an operator took over stays in human mode
      // indefinitely (autoResumeAiAfterMinutes defaults to off), which silently
      // dropped every reminder for that customer.
      scheduledReminder: true,
    })
    return true
  } catch (err) {
    // Couldn't even queue the send — remove the row we just wrote so the thread
    // doesn't show a reminder the customer never received.
    await db.message.delete({ where: { id: msg.id } }).catch(() => {})
    throw err
  }
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export interface ReminderSummary {
  remindersSent: number    // stages successfully claimed + emailed to ≥1 recipient
  emailsSent: number       // individual recipient emails delivered
  waRemindersSent: number  // customer WhatsApp reminders sent into the chat
  waRemindersFailed: number // claimed stages whose WhatsApp nudge never went out
  ownerWaSent: number      // owner WhatsApp alerts delivered to the notify number
  ownerWaFailed: number    // owner WhatsApp alerts that couldn't be sent
  errors: Array<{ appointmentId: string; stage: number; message: string }>
}

export async function runAppointmentReminders(now: Date = new Date()): Promise<ReminderSummary> {
  const summary: ReminderSummary = {
    remindersSent: 0, emailsSent: 0, waRemindersSent: 0, waRemindersFailed: 0,
    ownerWaSent: 0, ownerWaFailed: 0, errors: [],
  }
  const windowEnd = new Date(now.getTime() + MAX_LEAD_WINDOW_MS)

  // Upcoming, still-scheduled appointments with at least one unsent reminder.
  const appts = await db.appointment.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gt: now, lte: windowEnd },
      OR: [{ reminder1SentAt: null }, { reminder2SentAt: null }],
    },
    select: {
      id: true, userId: true, agentId: true, conversationId: true,
      title: true, notes: true, customerName: true, customerNumber: true,
      scheduledAt: true,
      reminder1Minutes: true, reminder1SentAt: true,
      reminder2Minutes: true, reminder2SentAt: true,
      agent: {
        select: {
          businessName: true, businessDescription: true,
          // Only to self-guard the owner alert against the business's own line.
          baileysSession: { select: { phoneNumber: true } },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: MAX_PER_RUN,
  })

  // Flatten to (appointment, due-stage) tasks. Skip appointments with nothing due.
  const tasks = appts.flatMap((a) => dueStages(a, now).map((s) => ({ appt: a, ...s })))
  if (tasks.length === 0) return summary

  const { recipientsFor, brandFor } = await loadRecipients(tasks.map((t) => t.appt.userId))

  await mapWithConcurrency(tasks, EMAIL_CONCURRENCY, async ({ appt, stage }) => {
    // Atomically claim this stage BEFORE sending — a guarded update so two
    // overlapping cron runs can't both send the same reminder. If the claim
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

    // Owner/team email. Looked up after the claim rather than before it, so a
    // missing owner row costs this email alone — it can no longer suppress the
    // customer's WhatsApp nudge below.
    const rcpt = recipientsFor(appt.userId)
    if (rcpt) {
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
    } else {
      console.error("[appointment-reminders] no owner record", { appointmentId: appt.id, stage, userId: appt.userId })
      summary.errors.push({
        appointmentId: appt.id,
        stage,
        message: `No owner record for userId ${appt.userId} — reminder email skipped`,
      })
    }

    // Owner WhatsApp alert — mirrors the reminder email onto the owner's own
    // number when they've opted in (whatsappNotificationsEnabled + a notify
    // number). Sent from the agent's session; skipped when that number is the
    // business line itself, which a session can't message. Shares the stage
    // claim, so it fires once per stage like the email. Best-effort: counted,
    // never fatal to the rest of the iteration.
    const owner = rcpt?.owner
    if (
      owner?.whatsappNotificationsEnabled &&
      owner.notifyWhatsappNumber?.trim() &&
      !sameNumber(owner.notifyWhatsappNumber, appt.agent.baileysSession?.phoneNumber)
    ) {
      try {
        await sendAppointmentReminderWhatsapp({
          agentId: appt.agentId,
          toNumber: owner.notifyWhatsappNumber.trim(),
          agentName: appt.agent.businessName,
          title: appt.title,
          whenLabel: whenLabel(appt.scheduledAt),
          leadLabel: leadLabel(remainingMin),
          customerName: appt.customerName,
          customerNumber: appt.customerNumber,
          notes: appt.notes,
        })
        summary.ownerWaSent++
      } catch (err) {
        summary.ownerWaFailed++
        console.error("[appointment-reminders] owner wa failed", { appointmentId: appt.id, stage }, err)
        summary.errors.push({
          appointmentId: appt.id,
          stage,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Customer WhatsApp reminder — for any appointment that carries a customer
    // number, including a manual (dashboard-booked) one with no chat thread yet:
    // we find-or-create the conversation so the nudge threads and shows up. Shares
    // the stage claim above, so it fires exactly once. Never throws: a failure
    // here can't undo the email, but it is counted so it doesn't vanish silently.
    if (appt.customerNumber) {
      try {
        const conversationId = await resolveCustomerConversationId({
          conversationId: appt.conversationId,
          agentId: appt.agentId,
          customerNumber: appt.customerNumber,
          customerName: appt.customerName,
        })
        // No usable digits in the typed number — there is nothing to address, so
        // record it rather than creating a junk conversation and "sending" into it.
        if (!conversationId) {
          summary.waRemindersFailed++
          summary.errors.push({
            appointmentId: appt.id,
            stage,
            message: `Customer number "${appt.customerNumber}" has no digits — WhatsApp reminder skipped`,
          })
          return
        }
        const sent = await sendWaReminder(
          {
            agentId: appt.agentId,
            conversationId,
            customerNumber: appt.customerNumber,
            customerName: appt.customerName,
            title: appt.title,
            notes: appt.notes,
            scheduledAt: appt.scheduledAt,
            agent: appt.agent,
          },
          remainingMin,
        )
        if (sent) {
          summary.waRemindersSent++
        } else {
          // Generation failed. The stage is already stamped, so this nudge is
          // gone for good — count it, or the run reports a clean `errors: []`
          // while the customer silently never hears from us.
          summary.waRemindersFailed++
          summary.errors.push({
            appointmentId: appt.id,
            stage,
            message: "WhatsApp reminder generation failed — nudge not sent",
          })
        }
      } catch (err) {
        summary.waRemindersFailed++
        console.error("[appointment-reminders] wa reminder failed", { appointmentId: appt.id, stage }, err)
        summary.errors.push({
          appointmentId: appt.id,
          stage,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
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
