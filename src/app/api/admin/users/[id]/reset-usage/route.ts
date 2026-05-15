import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

// Admin-only "start a fresh subscription cycle for this user" action.
// Pushes the user's subscriptionExpiresAt forward so the rolling 30-day
// billing window (defined in src/lib/billing-period.ts) starts now and
// closes 30 days out. Effect:
//   - Current period credit usage drops to 0 (because previous CreditUsage
//     rows fall outside the new window — they're preserved for analytics
//     but excluded from the "monthly used" calculation)
//   - Expiry-warning + expired-email flags are cleared so the user can be
//     warned/notified again for the new cycle
//
// Until the payment gateway is wired up, this is the manual equivalent of
// "the customer paid for another month".
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, plan: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // 30 days from now — same window the billing-period helper expects.
  const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const updated = await db.user.update({
    where: { id },
    data: {
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
}
