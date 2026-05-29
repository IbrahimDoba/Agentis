import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { findPaygTier, nextCreditExpiry } from "@/lib/credits"
import {
  initializeTransaction,
  estimatePaystackFee,
  newPaystackReference,
} from "@/lib/paystack"

// POST /api/credits/purchase — start a PAYG top-up.
// 1. Validate the user picked a configured tier (no arbitrary amounts in v1).
// 2. Create a PENDING CreditPurchase ledger row first — gives us a unique
//    reference Paystack will echo back on the webhook, and an audit trail
//    even if the user abandons the checkout.
// 3. Initialize the Paystack transaction with that reference + metadata.
// 4. Return the authorization_url for the client to redirect to.
//
// On the webhook side, this row transitions PENDING → COMPLETED and the
// credits are added to the user's wallet atomically.

const bodySchema = z.object({
  amountNaira: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const tier = findPaygTier(parsed.amountNaira)
  if (!tier) {
    return NextResponse.json(
      { error: "Amount does not match a configured credit pack" },
      { status: 400 }
    )
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const reference = newPaystackReference()
  const estimatedFee = estimatePaystackFee(tier.amountNaira)
  const estimatedNet = tier.amountNaira - estimatedFee
  const expiresAt = nextCreditExpiry()

  const purchase = await db.creditPurchase.create({
    data: {
      userId: user.id,
      reference,
      amountNaira: tier.amountNaira,
      netNaira: estimatedNet,
      creditsAdded: tier.credits,
      unitRateNGN: tier.ngnPerCredit,
      status: "PENDING",
      expiresAt,
    },
    select: { id: true, reference: true },
  })

  let init
  try {
    init = await initializeTransaction({
      email: user.email,
      // Paystack works in kobo (minor units). 1 NGN = 100 kobo.
      amountKobo: tier.amountNaira * 100,
      reference,
      // metadata is echoed back on the webhook for cross-checks
      metadata: { userId: user.id, purchaseId: purchase.id, tier: tier.amountNaira },
      // Configurable later; for now bounce back to a dashboard credits page.
      callbackUrl: `${process.env.NEXTAUTH_URL ?? ""}/dashboard/credits?ref=${reference}`,
    })
  } catch (err) {
    // Paystack failed — leave the PENDING row in place (admins can clean up).
    console.error("[credits.purchase] Paystack initialize failed", err)
    return NextResponse.json(
      { error: "Payment provider unavailable. Please try again." },
      { status: 502 }
    )
  }

  return NextResponse.json({
    reference,
    authorizationUrl: init.authorizationUrl,
    amountNaira: tier.amountNaira,
    credits: tier.credits,
  })
}
