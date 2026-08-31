import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  sendApprovedBatch,
  sentToday,
  effectiveDailyCap,
  warmupStatus,
  assertOutreachConfigured,
} from "@/lib/outreach/send"
import { transportName } from "@/lib/outreach/transport"

// Manual "release the next slice now" for the approved queue, plus the
// deliverability health read the admin page renders.
//
// The steady drip runs on /api/cron/outreach?job=send from a Dokploy Schedule.
// This route exists so a human can push the queue along without waiting for the
// next tick, and it shares the same caps and pacing — it cannot flush the whole
// day's allowance in one go.

export const maxDuration = 300

const bodySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
})

// Bulk-sender ceilings: complaints must stay under 0.3% and bounces under 2%,
// enforced at the SMTP layer by Gmail, Yahoo and Microsoft. These trip well
// below that, because by the time a rolling average crosses the real limit the
// domain is already damaged.
//
// Sending over SMTP means there is NO complaint feedback loop — the webhook that
// fed this breaker only exists on the Resend path. So on the Zoho transport a
// bounce is very nearly the only automated signal we get, and it is treated
// accordingly: the first hard bounce pauses for a human look rather than
// contributing to a rate that would need dozens of failures to trip. Complaint
// visibility comes from Google Postmaster Tools instead, which is manual.
const COMPLAINT_TRIP_RATE = 0.001
const BOUNCE_TRIP_RATE = 0.02
const MIN_SAMPLE_FOR_TRIP = 50

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    assertOutreachConfigured()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outreach sending is not configured" },
      { status: 400 }
    )
  }

  const parsed = bodySchema.safeParse((await req.json().catch(() => null)) ?? {})
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const health = await deliverabilityHealth()
  if (health.tripped) {
    return NextResponse.json(
      { error: `Sending halted: ${health.reason}`, health },
      { status: 409 }
    )
  }

  const counts = await sendApprovedBatch(parsed.data.limit)
  return NextResponse.json({
    ...counts,
    sentToday: await sentToday(),
    cap: effectiveDailyCap(),
    warmup: warmupStatus(),
    health,
  })
}

export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({
    sentToday: await sentToday(),
    cap: effectiveDailyCap(),
    warmup: warmupStatus(),
    approved: await db.outreachMessage.count({ where: { status: "approved" } }),
    health: await deliverabilityHealth(),
  })
}

async function deliverabilityHealth() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [sent, bounced, complained] = await Promise.all([
    db.outreachMessage.count({ where: { status: "sent", sentAt: { gte: since } } }),
    db.outreachMessage.count({ where: { status: "failed", error: { contains: "bounce" }, createdAt: { gte: since } } }),
    db.outreachSuppression.count({ where: { reason: "complained", createdAt: { gte: since } } }),
  ])

  const bounceRate = sent > 0 ? bounced / sent : 0
  const complaintRate = sent > 0 ? complained / sent : 0

  // Below the sample floor the rates are noise, but a complaint is never noise:
  // at pilot volume a single one is already over the ceiling, and it means
  // something about the targeting or the copy is wrong.
  if (complained > 0) {
    return { tripped: true, reason: `${complained} complaint(s) in the last 7 days`, sent, bounced, complained, bounceRate, complaintRate }
  }
  // Same logic for bounces on the SMTP transport, where they are the only signal
  // arriving on their own. One hard bounce out of a few dozen sends is already
  // well over the 2% ceiling, so waiting for a rate to form is waiting too long.
  if (transportName() === "zoho-smtp" && bounced > 0) {
    return { tripped: true, reason: `${bounced} hard bounce(s) — review the list before sending more`, sent, bounced, complained, bounceRate, complaintRate }
  }
  if (sent >= MIN_SAMPLE_FOR_TRIP && bounceRate > BOUNCE_TRIP_RATE) {
    return { tripped: true, reason: `bounce rate ${(bounceRate * 100).toFixed(1)}%`, sent, bounced, complained, bounceRate, complaintRate }
  }
  if (sent >= MIN_SAMPLE_FOR_TRIP && complaintRate > COMPLAINT_TRIP_RATE) {
    return { tripped: true, reason: `complaint rate ${(complaintRate * 100).toFixed(2)}%`, sent, bounced, complained, bounceRate, complaintRate }
  }

  return { tripped: false, reason: null, sent, bounced, complained, bounceRate, complaintRate }
}
