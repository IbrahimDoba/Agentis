import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { PLAN_PRICES } from "@/lib/plans"
import { initializeTransaction, newSubscriptionReference } from "@/lib/paystack"
import { addOneMonth } from "@/lib/subscriptionBilling"

// "Update payment method" = a hosted checkout for the user's CURRENT plan. The
// successful charge captures a fresh reusable authorization (new card) AND
// renews the cycle. Simpler and more honest than a ₦0/₦50 verify charge.
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, plan: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const planNaira = PLAN_PRICES[user.plan] ?? 0
  if (planNaira <= 0) {
    return NextResponse.json(
      { error: "You're on the Free plan — choose a plan to add a card." },
      { status: 400 }
    )
  }

  const reference = newSubscriptionReference()
  const periodStart = new Date()
  await db.subscriptionCharge.create({
    data: {
      userId: user.id, plan: user.plan, reference, kind: "initial",
      planNaira, overageNaira: 0, amountNaira: planNaira, netNaira: planNaira,
      status: "PENDING", periodStart, periodEnd: addOneMonth(periodStart),
    },
  })

  const base = process.env.NEXTAUTH_URL ?? ""
  const init = await initializeTransaction({
    email: user.email,
    amountKobo: planNaira * 100,
    reference,
    callbackUrl: `${base}/dashboard/subscription?ref=${reference}`,
    metadata: { purpose: "subscription", userId: user.id, plan: user.plan, kind: "initial" },
  })

  return NextResponse.json({ authorizationUrl: init.authorizationUrl, reference })
}
