import { createHmac, timingSafeEqual } from "node:crypto"

// Minimal Paystack client for the PAYG purchase flow.
// Docs: https://paystack.com/docs/api/transaction/

const PAYSTACK_BASE = "https://api.paystack.co"

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key || key === "sk_test_REPLACE_ME") {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured. " +
        "Set it in .env.local (sk_test_...) or Vercel prod env (sk_live_...)."
    )
  }
  return key
}

// ── Transaction initialize ─────────────────────────────────────────────────

export interface InitializeArgs {
  /** Customer email — Paystack uses this on receipts. */
  email: string
  /** Amount in KOBO (NGN × 100). Paystack always wants minor units. */
  amountKobo: number
  /** Unique server-side reference — also our CreditPurchase.reference. */
  reference: string
  /** Optional callback URL (overrides the dashboard-level default). */
  callbackUrl?: string
  /** Arbitrary key/value bag echoed back on the webhook. We stash userId here. */
  metadata?: Record<string, unknown>
}

export interface InitializeResult {
  authorizationUrl: string  // hosted checkout the user is redirected to
  reference: string         // what came back (should equal what we sent)
  accessCode: string        // can be used to mount the inline JS popup later
}

/**
 * Initialize a Paystack transaction and get the hosted-checkout URL.
 * Throws on any non-2xx so the route handler can surface the failure.
 */
export async function initializeTransaction(args: InitializeArgs): Promise<InitializeResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: args.email,
      amount: args.amountKobo,
      reference: args.reference,
      callback_url: args.callbackUrl,
      metadata: args.metadata,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Paystack initialize failed: HTTP ${res.status} ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    status: boolean
    data?: { authorization_url: string; reference: string; access_code: string }
    message?: string
  }
  if (!json.status || !json.data) {
    throw new Error(`Paystack initialize failed: ${json.message ?? "unknown error"}`)
  }
  return {
    authorizationUrl: json.data.authorization_url,
    reference: json.data.reference,
    accessCode: json.data.access_code,
  }
}

// ── Saved-card authorization (recurring charges) ───────────────────────────

/**
 * A Paystack card authorization. Captured from the first successful charge
 * (verify / webhook) and reused to charge the same card again. ONLY charge
 * authorizations where `reusable` is true.
 */
export interface PaystackAuthorization {
  authorization_code: string
  last4?: string
  exp_month?: string
  exp_year?: string
  card_type?: string
  bank?: string
  brand?: string
  reusable?: boolean
}

export interface ChargeAuthorizationArgs {
  /** Reusable card token from a prior successful transaction. */
  authorizationCode: string
  email: string
  /** Amount in KOBO. Can differ each cycle (plan + overage). */
  amountKobo: number
  /** Our deterministic per-cycle reference — the idempotency anchor. */
  reference: string
  metadata?: Record<string, unknown>
}

export interface ChargeAuthorizationResult {
  /** Transaction outcome: "success" | "failed" | "abandoned" | ... */
  status: string
  reference: string
  /** Paystack fee in kobo, when present. */
  feesKobo?: number
  gatewayResponse?: string
}

/**
 * Charge a saved (reusable) card. Used for subscription renewals and immediate
 * upgrade charges — WE control the timing (our cron) and the amount.
 * Throws only on transport / non-2xx; a declined card returns status "failed".
 */
export async function chargeAuthorization(args: ChargeAuthorizationArgs): Promise<ChargeAuthorizationResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/charge_authorization`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorization_code: args.authorizationCode,
      email: args.email,
      amount: args.amountKobo,
      reference: args.reference,
      metadata: args.metadata,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Paystack charge_authorization failed: HTTP ${res.status} ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    status: boolean
    message?: string
    data?: { status?: string; reference?: string; fees?: number; gateway_response?: string }
  }
  // `status:false` at the API level means the request itself was rejected
  // (e.g. authorization not reusable) — treat as a failed charge, not a throw,
  // so the caller's dunning path handles it uniformly.
  if (!json.status || !json.data) {
    return { status: "failed", reference: args.reference, gatewayResponse: json.message }
  }
  return {
    status: json.data.status ?? "failed",
    reference: json.data.reference ?? args.reference,
    feesKobo: typeof json.data.fees === "number" ? json.data.fees : undefined,
    gatewayResponse: json.data.gateway_response,
  }
}

// ── Transaction verify (reconcile + capture authorization) ─────────────────

export interface VerifyResult {
  status: string // transaction status: "success" | "failed" | ...
  reference: string
  amountKobo: number
  feesKobo?: number
  customerCode?: string
  email?: string
  authorization?: PaystackAuthorization
  metadata?: Record<string, unknown>
}

/**
 * Verify a transaction by reference (GET /transaction/verify/:ref). Used to
 * (a) reconcile after the checkout redirect in case the webhook is delayed and
 * (b) capture the reusable card authorization from the first payment.
 */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Paystack verify failed: HTTP ${res.status} ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    status: boolean
    message?: string
    data?: {
      status?: string
      reference?: string
      amount?: number
      fees?: number
      customer?: { customer_code?: string; email?: string }
      authorization?: PaystackAuthorization
      metadata?: Record<string, unknown>
    }
  }
  if (!json.status || !json.data) {
    throw new Error(`Paystack verify failed: ${json.message ?? "unknown error"}`)
  }
  return {
    status: json.data.status ?? "failed",
    reference: json.data.reference ?? reference,
    amountKobo: typeof json.data.amount === "number" ? json.data.amount : 0,
    feesKobo: typeof json.data.fees === "number" ? json.data.fees : undefined,
    customerCode: json.data.customer?.customer_code,
    email: json.data.customer?.email,
    authorization: json.data.authorization,
    metadata: json.data.metadata,
  }
}

// ── Webhook signature verification ─────────────────────────────────────────

/**
 * Verify the `x-paystack-signature` header against the RAW request body using
 * HMAC-SHA512 keyed with the secret. Uses timingSafeEqual to avoid leaking
 * the signature via response-time differences.
 *
 * Pass the raw body string (NOT the parsed object) — JSON.stringify on a
 * parsed object reorders keys and breaks the hash.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string = getSecretKey()
): boolean {
  if (!signatureHeader) return false
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex")
  // timingSafeEqual requires equal-length buffers; bail if mismatched.
  if (expected.length !== signatureHeader.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHeader, "hex"))
  } catch {
    // Malformed hex in either side → not equal.
    return false
  }
}

// ── Paystack fee estimation ────────────────────────────────────────────────

/**
 * Estimate the Paystack fee for a local (NGN) card transaction.
 * Current pricing: 1.5% + ₦100 (₦100 waived under ₦2,500), total fee capped
 * at ₦2,000. Used to compute `netNaira` for the CreditPurchase ledger at
 * init time; the webhook later overwrites with the actual `fees` Paystack
 * reports for that charge.
 */
export function estimatePaystackFee(amountNaira: number): number {
  if (amountNaira <= 0) return 0
  const flat = amountNaira >= 2500 ? 100 : 0
  const pct = Math.round(amountNaira * 0.015)
  const total = flat + pct
  return Math.min(total, 2000)
}

// ── Reference generator ────────────────────────────────────────────────────

/**
 * Build a Paystack reference unique per purchase. Format keeps a constant
 * prefix so we can quickly identify D-Zero charges in the Paystack dashboard.
 */
export function newPaystackReference(): string {
  const random = Math.random().toString(36).slice(2, 10)
  const ts = Date.now().toString(36)
  return `DZ_${ts}_${random}`
}

/**
 * Reference for a subscription's FIRST charge / ad-hoc upgrade (DZ_SUB_ prefix
 * so subscription charges are distinguishable from credit top-ups in the
 * dashboard and in our unified webhook router). Recurring renewals use a
 * deterministic per-cycle reference built in the billing lib instead.
 */
export function newSubscriptionReference(): string {
  const random = Math.random().toString(36).slice(2, 10)
  const ts = Date.now().toString(36)
  return `DZ_SUB_${ts}_${random}`
}
