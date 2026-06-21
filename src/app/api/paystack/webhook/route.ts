import { NextResponse } from "next/server"
import { verifyWebhookSignature, type PaystackAuthorization } from "@/lib/paystack"
import { applyChargeSuccess } from "@/lib/creditPurchaseEvents"
import { applySubscriptionCharge } from "@/lib/subscriptionBilling"

// UNIFIED Paystack webhook. Paystack allows ONE webhook URL per mode, so every
// event — credit top-ups AND subscription charges — lands here. We verify the
// HMAC-SHA512 signature over the RAW body, then dispatch by metadata.purpose
// (falling back to the reference prefix: subscription refs are "DZ_SUB_...").
//
// Point the Paystack dashboard webhook at /api/paystack/webhook.
//
// Idempotency + retries: each handler is idempotent (unique reference anchor),
// and we ALWAYS return 200 on a signature-valid delivery so Paystack stops
// retrying. Bad signature → 401 (Paystack retries later).

interface PaystackWebhookData {
  reference?: string
  status?: string
  fees?: number
  customer?: { customer_code?: string }
  authorization?: PaystackAuthorization
  metadata?: { purpose?: string } & Record<string, unknown>
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-paystack-signature")

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[paystack.webhook] rejected: bad signature")
    return new NextResponse("Invalid signature", { status: 401 })
  }

  let payload: { event?: string; data?: PaystackWebhookData }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  const event = payload.event
  const data = payload.data
  const reference = data?.reference

  // Only successful charges grant anything. Everything else (failed, refund,
  // subscription.* lifecycle we don't use) is acknowledged so Paystack stops.
  if (event !== "charge.success" || !reference) {
    return NextResponse.json({ received: true })
  }

  const isSubscription =
    data?.metadata?.purpose === "subscription" || reference.startsWith("DZ_SUB_")

  const feeNaira = typeof data?.fees === "number" ? data.fees / 100 : undefined

  try {
    if (isSubscription) {
      const outcome = await applySubscriptionCharge({
        reference,
        authorization: data?.authorization,
        customerCode: data?.customer?.customer_code,
        actualFeeNaira: feeNaira,
      })
      if (outcome.result === "unknown_reference") {
        console.warn("[paystack.webhook] subscription charge for unknown reference", { reference })
      }
      return NextResponse.json({ received: true, kind: "subscription", outcome })
    }

    const outcome = await applyChargeSuccess({ reference, actualFeeNaira: feeNaira })
    if (outcome.result === "grant_failed") {
      // CRITICAL — row PAID but credits not granted. Surface for monitoring.
      console.error("[paystack.webhook] credit grant_failed", { reference, reason: outcome.reason })
    }
    return NextResponse.json({ received: true, kind: "credits", outcome })
  } catch (err) {
    // Unexpected error — log and still 200 so Paystack doesn't hammer us; the
    // PENDING row stays claimable and the callback-verify reconciles it.
    console.error("[paystack.webhook] handler error", { reference, err: String(err) })
    return NextResponse.json({ received: true, error: "handler_error" })
  }
}
