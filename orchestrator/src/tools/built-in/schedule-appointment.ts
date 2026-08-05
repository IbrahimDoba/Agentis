import { randomUUID } from "crypto"
import type { ToolDefinition } from "../../providers/types.js"
import { sql } from "../../db/client.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:schedule_appointment" })

// Tool the AI calls once a customer has agreed to a concrete appointment,
// meeting, or inspection at a specific date AND time. Creates an Appointment
// row; the reminder cron (src/lib/appointment-reminders-job.ts) then emails the
// owner + team ahead of time. Gated per-agent by Agent.appointmentSchedulingEnabled.
export const SCHEDULE_APPOINTMENT_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "schedule_appointment",
    description:
      "Book an appointment, meeting, viewing, or inspection with the customer. Use ONLY when BOTH are true:\n" +
      "- The customer has clearly agreed to meet / book (not just asked whether it's possible)\n" +
      "- A specific date AND time have been settled (not 'sometime next week')\n" +
      "Before calling this, restate the exact date and time to the customer and get their confirmation. " +
      "Provide `scheduled_at` as a full ISO 8601 date-time and ALWAYS include the timezone offset (West Africa Time is +01:00) — e.g. \"2026-08-06T14:00:00+01:00\". Resolve relative dates (\"tomorrow\", \"next Tuesday\") against the Current time shown in your context. " +
      "After calling this tool, send one short message confirming the appointment is booked for that exact date and time.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "What the appointment is, in a few words — e.g. 'Property inspection', 'Consultation call', 'Store visit'. Use the customer's own words where possible.",
        },
        scheduled_at: {
          type: "string",
          description:
            "The agreed date and time as a full ISO 8601 string WITH timezone offset, e.g. '2026-08-06T14:00:00+01:00'. Must be in the future.",
        },
        notes: {
          type: "string",
          description:
            "Optional extra detail the person handling the appointment should know (location, what to bring, product of interest). Omit if none.",
        },
      },
      required: ["title", "scheduled_at"],
    },
  },
}

// Parse the model-provided scheduled_at into a UTC instant + a human-readable
// label. Accepts full ISO 8601; if the string carries no timezone offset we
// assume WAT (+01:00) — the agent's default zone (Africa/Lagos, no DST) and the
// zone the "Current time" prompt injection uses. Rejects garbage and anything
// in the past (a stale/miscomputed relative date) so the model re-confirms.
export function parseScheduledAt(raw: string, now: Date = new Date()): { at: Date; label: string } | null {
  const s = raw.trim()
  if (!s) return null
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s)
  const at = new Date(hasOffset ? s : `${s}+01:00`)
  if (Number.isNaN(at.getTime())) return null
  if (at.getTime() < now.getTime() - 60_000) return null // in the past
  const label = at.toLocaleString("en-US", {
    timeZone: "Africa/Lagos",
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  })
  return { at, label }
}

export async function executeScheduleAppointment(
  args: Record<string, unknown>,
  opts: { agentId: string; conversationId: string; userId: string }
): Promise<string> {
  const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : null
  const rawAt = typeof args.scheduled_at === "string" ? args.scheduled_at : null
  const notes = typeof args.notes === "string" ? args.notes.trim().slice(0, 1000) || null : null
  if (!title || !rawAt) {
    return JSON.stringify({ error: "title and scheduled_at are both required" })
  }

  const parsed = parseScheduledAt(rawAt)
  if (!parsed) {
    return JSON.stringify({
      error:
        "scheduled_at must be a valid ISO 8601 date-time in the future with a timezone offset (e.g. 2026-08-06T14:00:00+01:00). Confirm the exact date and time with the customer, then try again.",
    })
  }

  // The customer's identity lives on the Conversation (the AI path has no name
  // input). Pull it plus the owner's default reminder lead times so each
  // appointment starts from the account setting (still editable per-appointment).
  const ctxRows = await sql<{ phoneNumber: string; contactName: string | null }[]>`
    SELECT c."phoneNumber", c."contactName"
    FROM "Conversation" c WHERE c."id" = ${opts.conversationId} LIMIT 1
  `
  const ctx = ctxRows[0]
  if (!ctx) return JSON.stringify({ error: "Conversation not found" })

  const userRows = await sql<{ r1: number; r2: number | null }[]>`
    SELECT "appointmentReminder1Minutes" AS r1, "appointmentReminder2Minutes" AS r2
    FROM "User" WHERE "id" = ${opts.userId} LIMIT 1
  `
  const r1 = userRows[0]?.r1 ?? 60
  // Preserve a null account default (single-reminder) — don't coalesce it to 15.
  const r2 = userRows[0] ? userRows[0].r2 : 15

  const apptId = randomUUID()
  await sql`
    INSERT INTO "Appointment" (
      "id", "agentId", "userId", "conversationId",
      "customerName", "customerNumber", "title", "notes",
      "scheduledAt", "status", "createdBy",
      "reminder1Minutes", "reminder2Minutes",
      "createdAt", "updatedAt"
    ) VALUES (
      ${apptId}, ${opts.agentId}, ${opts.userId}, ${opts.conversationId},
      ${ctx.contactName}, ${ctx.phoneNumber}, ${title}, ${notes},
      ${parsed.at.toISOString()}, 'SCHEDULED', 'ai',
      ${r1}, ${r2},
      NOW(), NOW()
    )
  `

  logger.info(
    { conversationId: opts.conversationId, agentId: opts.agentId, apptId, scheduledAt: parsed.at.toISOString() },
    "Appointment scheduled by AI"
  )
  return JSON.stringify({
    success: true,
    scheduledFor: parsed.label,
    message: `Appointment saved for ${parsed.label}. Confirm this exact date and time back to the customer in your reply.`,
  })
}
