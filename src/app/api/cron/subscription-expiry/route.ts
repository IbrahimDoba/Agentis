import { NextRequest, NextResponse } from "next/server"
import { runSubscriptionExpiryScan } from "@/lib/subscription-expiry-job"

// Daily scheduled scan for the subscription-expiry email cycle. Should be
// hit once per day by an external scheduler (Railway cron, Vercel cron,
// GitHub Actions, cron-job.org, etc.). Protected by CRON_SECRET — the
// same shared secret pattern used by other internal automation endpoints.
//
// Idempotent: re-running it within the same day is safe because emails are
// gated by the User.expiryWarningEmailSentAt / expiredEmailSentAt flags.
//
// Example cron command:
//   curl -sS -H "Authorization: Bearer $CRON_SECRET" \
//        https://www.dailzero.com/api/cron/subscription-expiry

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
  const startedAt = Date.now()
  const summary = await runSubscriptionExpiryScan()
  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    ...summary,
  })
}

// Allow POST too in case the cron platform only sends POST. Same auth, same body.
export async function POST(req: NextRequest) {
  return GET(req)
}
