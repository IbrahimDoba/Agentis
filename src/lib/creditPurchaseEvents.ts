import { db } from "@/lib/db"
import { addCredits } from "@/lib/creditWallet"
import { sendCreditPurchaseReceipt } from "@/lib/email"

// Service layer for the Paystack webhook. Keeps the DB transitions + wallet
// crediting separate from the HTTP/HMAC concerns so they can be unit-tested
// against the real DB without spinning up the Next.js route runtime.

export type ApplyChargeOutcome =
  | { result: "granted"; creditsAdded: number }
  | { result: "already_processed" } // second webhook delivery for same charge
  | { result: "unknown_reference" } // Paystack event for a row we don't have
  | { result: "non_pending_skipped"; status: string } // FAILED / CANCELLED already
  | { result: "race_lost" }         // concurrent delivery beat us to the update
  | { result: "grant_failed"; reason: string } // CRITICAL — row PAID but credits not added

export interface ApplyChargeArgs {
  reference: string
  /** Actual Paystack fee in NAIRA (not kobo). Optional — when unknown the estimate stays in netNaira. */
  actualFeeNaira?: number
}

/**
 * Apply a `charge.success` event idempotently.
 *
 * Ordering: complete the row FIRST (idempotency anchor), THEN credit the
 * wallet. The reverse order would risk a webhook-retry double-credit.
 * If the credit grant fails after completion, monitoring picks it up and
 * a human resolves manually — better than silent over-charging users.
 */
export async function applyChargeSuccess(args: ApplyChargeArgs): Promise<ApplyChargeOutcome> {
  const purchase = await db.creditPurchase.findUnique({
    where: { reference: args.reference },
    select: {
      id: true, userId: true, status: true, creditsAdded: true, amountNaira: true, expiresAt: true,
      user: { select: { name: true, email: true } },
    },
  })

  if (!purchase) return { result: "unknown_reference" }
  if (purchase.status === "PAID") return { result: "already_processed" }
  if (purchase.status !== "PENDING") {
    return { result: "non_pending_skipped", status: purchase.status }
  }

  const actualNet =
    typeof args.actualFeeNaira === "number"
      ? Math.max(0, purchase.amountNaira - Math.round(args.actualFeeNaira))
      : undefined

  // Atomic conditional update. updateMany (NOT update) is the only Prisma
  // path that allows a non-unique WHERE — and returns the count, which is
  // exactly the race signal we want: 0 means another delivery transitioned
  // the row first.
  const transition = await db.creditPurchase.updateMany({
    where: { reference: args.reference, status: "PENDING" },
    data: {
      status: "PAID",
      completedAt: new Date(),
      ...(actualNet !== undefined ? { netNaira: actualNet } : {}),
    },
  })
  if (transition.count === 0) {
    return { result: "race_lost" }
  }

  try {
    await addCredits(purchase.userId, purchase.creditsAdded)
  } catch (err) {
    return { result: "grant_failed", reason: String(err) }
  }

  // Receipt email is best-effort — DON'T block the webhook response or
  // surface failure (Paystack retry won't help us send Resend mail).
  try {
    await sendCreditPurchaseReceipt({
      name: purchase.user.name,
      email: purchase.user.email,
      amountNaira: purchase.amountNaira,
      credits: purchase.creditsAdded,
      reference: args.reference,
      expiresAt: purchase.expiresAt,
    })
  } catch (err) {
    console.warn("[creditPurchase] receipt email failed (non-fatal)", { reference: args.reference, err: String(err) })
  }

  return { result: "granted", creditsAdded: purchase.creditsAdded }
}
