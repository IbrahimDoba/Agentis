import { NextRequest, NextResponse } from "next/server"
import { runInstantNotifications, runActivityDigest } from "@/lib/lead-notifications-job"
import { runAppointmentReminders } from "@/lib/appointment-reminders-job"

// Digests do real Resend round-trips across the whole base; give them headroom.
export const maxDuration = 300

// Lead & handoff email notifications, driven by an external scheduler on three
// cadences (all protected by CRON_SECRET, same pattern as subscription-expiry):
//
//   every ~1-2 min:  curl -H "Authorization: Bearer $CRON_SECRET" \
//                      "https://www.dailzero.com/api/cron/notifications?job=instant"
//   once daily:      ...?job=daily
//   once weekly:     ...?job=weekly
//
// Idempotent: instant alerts are gated by Lead.notifiedAt / Conversation
// .handoffNotifiedAt, so re-running within the interval never double-sends.
// Digests are cadence-driven — don't schedule them more than once per window.

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false // refuse to run if not configured
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  return token === expected
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const job = req.nextUrl.searchParams.get("job") ?? "instant"
  const startedAt = Date.now()

  switch (job) {
    case "instant": {
      const result = await runInstantNotifications()
      return NextResponse.json({ ok: true, job, durationMs: Date.now() - startedAt, result })
    }
    case "daily": {
      const result = await runActivityDigest("day")
      return NextResponse.json({ ok: true, job, durationMs: Date.now() - startedAt, result })
    }
    case "weekly": {
      const result = await runActivityDigest("week")
      return NextResponse.json({ ok: true, job, durationMs: Date.now() - startedAt, result })
    }
    case "appointment-reminders": {
      const result = await runAppointmentReminders()
      return NextResponse.json({ ok: true, job, durationMs: Date.now() - startedAt, result })
    }
    default:
      return NextResponse.json({ error: `Unknown job "${job}" — use instant | daily | weekly | appointment-reminders` }, { status: 400 })
  }
}

// Allow POST too in case the cron platform only sends POST. Same auth, same body.
export async function POST(req: NextRequest) {
  return GET(req)
}
