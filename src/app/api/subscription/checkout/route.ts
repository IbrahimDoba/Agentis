import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { PLAN_PRICES, PLAN_ORDER } from "@/lib/plans"
import { initializeTransaction, newSubscriptionReference } from "@/lib/paystack"
import { addOneMonth, chargeUpgradeNow, scheduleDowngrade, type RenewableUser } from "@/lib/subscriptionBilling"

// Start / change a Paystack subscription.
//  - downgrade (lower tier, while active) → scheduled at period end, no charge
//  - have a reusable card → charge the full new price instantly (upgrade/resub)
//  - first subscribe / declined card → hosted checkout to capture the card
const schema = z.object({ plan: z.enum(["basic", "starter", "pro"]) })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
  const { plan } = parsed.data

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, email: true, plan: true, subscriptionExpiresAt: true,
      paystackAuthorizationCode: true, authorizationReusable: true, pendingPlan: true,
    },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const planNaira = PLAN_PRICES[plan] ?? 0
  if (planNaira <= 0) return NextResponse.json({ error: "Plan is not purchasable" }, { status: 400 })

  const currentIdx = PLAN_ORDER.indexOf(user.plan)
  const targetIdx = PLAN_ORDER.indexOf(plan)
  const subActive = !!user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()
  const hasCard = !!user.paystackAuthorizationCode && user.authorizationReusable

  // Downgrade to a lower paid tier while still active → apply at next renewal.
  if (subActive && targetIdx < currentIdx) {
    await scheduleDowngrade(user.id, plan)
    return NextResponse.json({ scheduled: true, effectiveAt: user.subscriptionExpiresAt })
  }

  // Reusable card on file → charge the full new price now (upgrade / resubscribe).
  if (hasCard) {
    const ru: RenewableUser = {
      id: user.id, email: user.email, plan: user.plan,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      paystackAuthorizationCode: user.paystackAuthorizationCode,
      authorizationReusable: user.authorizationReusable,
      pendingPlan: user.pendingPlan,
    }
    const res = await chargeUpgradeNow(ru, plan)
    if (res.result === "renewed") return NextResponse.json({ activated: true })
    if (res.result === "skipped") return NextResponse.json({ error: res.reason }, { status: 400 })
    // no_authorization / charge_failed → fall through to hosted checkout to
    // capture a fresh card.
  }

  // First subscribe (or declined card) → hosted checkout captures the card.
  const reference = newSubscriptionReference()
  const periodStart = new Date()
  await db.subscriptionCharge.create({
    data: {
      userId: user.id, plan, reference, kind: "initial",
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
    metadata: { purpose: "subscription", userId: user.id, plan, kind: "initial" },
  })

  return NextResponse.json({ authorizationUrl: init.authorizationUrl, reference })
}
