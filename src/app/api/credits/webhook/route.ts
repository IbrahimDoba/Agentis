import { NextRequest, NextResponse } from "next/server"
import { verifyWebhookSignature } from "@/lib/paystack"
import { applyChargeSuccess } from "@/lib/creditPurchaseEvents"

// Paystack webhook handler.
//
// Security
// --------
// Paystack POSTs to this URL whenever a transaction event fires. We MUST
// verify the `x-paystack-signature` (HMAC-SHA512 of the raw body keyed with
// our secret key) before trusting anything in the payload. Without that
// check, anyone could POST `charge.success` and grant themselves credits.
//
// Idempotency
// -----------
// Paystack retries failed deliveries — the same event can arrive 2-3 times.
// We key idempotency on the unique Paystack `reference`, which is also the
// unique key on CreditPurchase. The transition PENDING → COMPLETED happens
// exactly once; subsequent deliveries see a COMPLETED row and acknowledge
// with 200 OK without re-crediting.
//
// We always respond 200 OK on signature-valid deliveries so Paystack stops
// retrying. Internal errors are LOGGED but don't reject — a retry won't
// help us if we can't read our own DB.

export async function POST(req: NextRequest) {
  // Read the RAW body — HMAC must run against the exact bytes Paystack signed.
  // Parsing first and re-stringifying reorders keys and breaks the hash.
  const rawBody = await req.text()
  const signature = req.headers.get("x-paystack-signature")

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[paystack.webhook] Rejected: bad signature")
    return new NextResponse("Invalid signature", { status: 401 })
  }

  let payload: { event?: string; data?: { reference?: string; fees?: number; status?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  const event = payload.event
  const reference = payload.data?.reference

  // We only act on successful charges. Other events (failed, refund, etc.)
  // are acknowledged silently for now — wire them when needed.
  if (event !== "charge.success" || !reference) {
    return NextResponse.json({ received: true })
  }

  // Paystack reports `fees` in kobo — convert to NGN for the ledger.
  const actualFeeNaira = typeof payload.data?.fees === "number" ? payload.data.fees / 100 : undefined

  const outcome = await applyChargeSuccess({ reference, actualFeeNaira })

  if (outcome.result === "grant_failed") {
    console.error(
      "[paystack.webhook] CRITICAL: COMPLETED but credit grant failed",
      { reference, reason: outcome.reason }
    )
  } else if (outcome.result === "unknown_reference") {
    console.warn("[paystack.webhook] charge.success for unknown reference", { reference })
  }

  // Always respond 200 on signature-valid deliveries so Paystack stops
  // retrying. Diagnostic fields in the body are for our logs, not Paystack.
  return NextResponse.json({ received: true, outcome })
}
