import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { verifyTransaction } from "@/lib/paystack"
import { applySubscriptionCharge } from "@/lib/subscriptionBilling"

// Reconcile after the Paystack checkout redirect, in case the webhook is
// delayed. Verifies the transaction with Paystack and applies it idempotently
// (a later webhook is then a no-op). Scoped to the caller's own charge.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const reference = req.nextUrl.searchParams.get("ref")
  if (!reference) return NextResponse.json({ error: "Missing ref" }, { status: 400 })

  // Ensure the charge belongs to the caller before we act on it.
  const charge = await db.subscriptionCharge.findUnique({
    where: { reference },
    select: { userId: true, status: true },
  })
  if (!charge || charge.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (charge.status === "PAID") return NextResponse.json({ status: "success", applied: false })

  let v
  try {
    v = await verifyTransaction(reference)
  } catch (err) {
    return NextResponse.json({ status: "pending", error: String(err) })
  }

  if (v.status === "success") {
    const outcome = await applySubscriptionCharge({
      reference,
      authorization: v.authorization,
      customerCode: v.customerCode,
      actualFeeNaira: typeof v.feesKobo === "number" ? v.feesKobo / 100 : undefined,
    })
    return NextResponse.json({ status: "success", applied: outcome.result === "activated" })
  }

  return NextResponse.json({ status: v.status })
}
