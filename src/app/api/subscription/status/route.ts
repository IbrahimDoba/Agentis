import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Billing/subscription state for the dashboard subscription page (the bits
// usePlanStats doesn't carry: auto-renew, status, card on file, scheduled
// downgrade).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      plan: true,
      subscriptionExpiresAt: true,
      subscriptionStatus: true,
      autoRenew: true,
      cancelAtPeriodEnd: true,
      pendingPlan: true,
      cardLast4: true,
      cardBrand: true,
      cardExpiry: true,
    },
  })
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    plan: u.plan,
    subscriptionExpiresAt: u.subscriptionExpiresAt?.toISOString() ?? null,
    subscriptionStatus: u.subscriptionStatus,
    autoRenew: u.autoRenew,
    cancelAtPeriodEnd: u.cancelAtPeriodEnd,
    pendingPlan: u.pendingPlan,
    card: u.cardLast4 ? { last4: u.cardLast4, brand: u.cardBrand, expiry: u.cardExpiry } : null,
  })
}
