import { withAdmin } from "@/lib/api/withAuth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

// Admin-only "start a fresh subscription cycle for this user" action.
// Stamps currentPeriodStart = now and pushes subscriptionExpiresAt 30 days out,
// so the billing window (src/lib/billing-period.ts) becomes [now, now+30d].
// Effect:
//   - Current period credit usage drops to 0 (because previous CreditUsage
//     rows fall outside the new window — they're preserved for analytics
//     but excluded from the "monthly used" calculation)
//   - Expiry-warning + expired-email flags are cleared so the user can be
//     warned/notified again for the new cycle
//
// Until the payment gateway is wired up, this is the manual equivalent of
// "the customer paid for another month".
export const POST = withAdmin(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, plan: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Start a fresh 30-day window NOW: currentPeriodStart anchors it so usage
  // counts from this moment, and expiry closes it 30 days out. Previous
  // CreditUsage rows fall outside [now, now+30d] and drop off "monthly used".
  const now = new Date()
  const newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const updated = await db.user.update({
    where: { id },
    data: {
      currentPeriodStart: now,
      subscriptionExpiresAt: newExpiresAt,
      expiryWarningEmailSentAt: null,
      expiredEmailSentAt: null,
    },
    select: { id: true, plan: true, subscriptionExpiresAt: true },
  })

  return NextResponse.json({
    ok: true,
    plan: updated.plan,
    subscriptionExpiresAt: updated.subscriptionExpiresAt?.toISOString() ?? null,
  })
})
