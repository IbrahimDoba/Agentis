import { NextRequest, NextResponse } from "next/server"
import { sendApprovedBatch, sentToday, sentLastHour, effectiveDailyCap, warmupStatus } from "@/lib/outreach/send"
import { expireStaleDemos } from "@/lib/outreach/demo"

// Outreach cron, same shape and CRON_SECRET guard as
// src/app/api/cron/notifications/route.ts.
//
//   every 10 min:  curl -H "Authorization: Bearer $CRON_SECRET" \
//                    "https://www.dailzero.com/api/cron/outreach?job=send"
//   hourly:        ...?job=demos
//
// MUST be registered in Dokploy Schedules. Prod runs on Dokploy, not Vercel, so
// an entry in vercel.json alone silently never fires.
//
// Sending is a drip rather than a batch: each invocation releases a few messages
// with randomised gaps, and the ten-minute cadence carries the rest. That keeps
// us inside the provider's rolling hourly window and stops a day's volume
// leaving in one burst, which is the pattern that gets a mailbox flagged.

export const maxDuration = 300

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

  const job = req.nextUrl.searchParams.get("job") ?? "send"
  const startedAt = Date.now()

  try {
    switch (job) {
      case "send": {
        const counts = await sendApprovedBatch()
        return NextResponse.json({
          job,
          ...counts,
          sentToday: await sentToday(),
          sentLastHour: await sentLastHour(),
          cap: effectiveDailyCap(),
          warmup: warmupStatus(),
          ms: Date.now() - startedAt,
        })
      }

      case "demos": {
        const expired = await expireStaleDemos()
        return NextResponse.json({ job, expired, ms: Date.now() - startedAt })
      }

      default:
        return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 })
    }
  } catch (error) {
    // Surfaced rather than swallowed: a cron that 200s while doing nothing is
    // indistinguishable from one that is working.
    console.error(`[CRON /outreach?job=${job}]`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export const POST = GET
