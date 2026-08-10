import crypto from "crypto"

// Thin client for the official Meta WhatsApp Cloud API, scoped to the
// meta-integration test harness. Config is read from env so the harness stays
// isolated from the app's Baileys/worker credentials (WHATSAPP_ACCESS_TOKEN et
// al. still point at the legacy number). See src/app/meta-test for the UI.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0"

export interface MetaConfig {
  phoneNumberId: string
  accessToken: string
}

// Non-throwing view of which env pieces are present — powers the UI's config
// panel (so you can see at a glance what's missing before recording) without
// leaking secret values to the client.
export function metaConfigStatus() {
  return {
    graphVersion: GRAPH_VERSION,
    phoneNumberId: process.env.META_TEST_PHONE_NUMBER_ID || null,
    hasAccessToken: !!process.env.META_TEST_ACCESS_TOKEN,
    hasAppSecret: !!process.env.META_APP_SECRET,
    hasVerifyToken: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
  }
}

// Strict accessor for the send path — throws a precise error naming the missing
// var rather than letting an undefined slip into a Graph call. (The verify token
// and app secret have their own accessors, since the webhook GET/signature paths
// each depend on only one of them.)
export function getMetaConfig(): MetaConfig {
  const phoneNumberId = process.env.META_TEST_PHONE_NUMBER_ID
  const accessToken = process.env.META_TEST_ACCESS_TOKEN

  const missing = [
    !phoneNumberId && "META_TEST_PHONE_NUMBER_ID",
    !accessToken && "META_TEST_ACCESS_TOKEN",
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`Missing Meta env vars: ${missing.join(", ")}`)
  }

  return { phoneNumberId: phoneNumberId!, accessToken: accessToken! }
}

export interface SendTextResult {
  waMessageId: string | null
  raw: unknown
}

// Send a free-form text via POST /{phone_number_id}/messages. Only delivers
// inside the 24h customer-service window (the customer must have messaged
// first) — which is exactly the inbound→reply flow this harness demonstrates.
export async function sendText(to: string, body: string): Promise<SendTextResult> {
  const { phoneNumberId, accessToken } = getMetaConfig()
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  })

  const raw = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (raw as { error?: { message?: string } })?.error?.message || res.statusText
    throw new Error(`Cloud API send failed (${res.status}): ${detail}`)
  }

  const waMessageId =
    (raw as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null
  return { waMessageId, raw }
}

// GET webhook verification handshake. Meta calls with hub.mode=subscribe and the
// verify token you configured; echo hub.challenge back on a match. Depends only
// on the verify token so you can complete Meta's handshake before the access
// token / app secret are filled in.
export function verifyWebhookChallenge(params: URLSearchParams): string | null {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN
  if (!verifyToken) throw new Error("Missing Meta env var: META_WEBHOOK_VERIFY_TOKEN")
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")
  if (mode === "subscribe" && token === verifyToken) return challenge
  return null
}

// Validate the X-Hub-Signature-256 header on inbound webhooks. Meta signs the
// RAW request body with the app secret (HMAC-SHA256) — so callers must pass the
// unparsed body string, and we compare in constant time to avoid a timing leak.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) throw new Error("Missing Meta env var: META_APP_SECRET")
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch, so length-guard first.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
