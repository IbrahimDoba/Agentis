import crypto from "crypto"

// Thin client for the official Meta WhatsApp Cloud API. Credentials are always
// passed in rather than read from env: every number belongs to a business that
// connected it through Embedded Signup, and each carries its own token.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0"

export interface MetaConfig {
  phoneNumberId: string
  accessToken: string
}

export interface SendTextResult {
  waMessageId: string | null
  raw: unknown
}

// Send a free-form text via POST /{phone_number_id}/messages. Only delivers
// inside the 24h customer-service window (the customer must have messaged
// first) — which is exactly the inbound→reply flow this harness demonstrates.
export async function sendText(
  to: string,
  body: string,
  // Which number to send AS, always explicit: every number belongs to a
  // business that connected it, and its replies must go out with that
  // business's own credentials.
  from: MetaConfig
): Promise<SendTextResult> {
  const { phoneNumberId, accessToken } = from
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

export interface TemplateParam {
  type: "text"
  text: string
}

// Send an approved template via POST /{phone_number_id}/messages.
//
// This is the ONLY way to reach a customer outside the 24-hour service window,
// which is why broadcasts must use it: a free-form send to someone who hasn't
// messaged recently is rejected by Meta, not merely undelivered.
export async function sendTemplate(
  to: string,
  template: { name: string; language: string; params?: TemplateParam[] },
  from: MetaConfig
): Promise<SendTextResult> {
  const { phoneNumberId, accessToken } = from
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
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        // Components are omitted entirely when the template has no variables —
        // Meta rejects an empty parameters array.
        ...(template.params?.length
          ? { components: [{ type: "body", parameters: template.params }] }
          : {}),
      },
    }),
  })

  const raw = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (raw as { error?: { message?: string } })?.error?.message || res.statusText
    throw new Error(`Cloud API template send failed (${res.status}): ${detail}`)
  }

  const waMessageId =
    (raw as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null
  return { waMessageId, raw }
}
