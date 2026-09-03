import { db } from "@/lib/db"
import { encryptToken, decryptToken } from "./crypto"

// Embedded Signup: the flow by which a business owner grants this app access to
// THEIR WhatsApp Business Account, rather than us pasting a token into env.
// The browser gets a short-lived code from Meta's popup; everything here runs
// server-side so the app secret never reaches the client.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0"

function appCredentials() {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const missing = [!appId && "META_APP_ID", !appSecret && "META_APP_SECRET"].filter(Boolean)
  if (missing.length) throw new Error(`Missing Meta env vars: ${missing.join(", ")}`)
  return { appId: appId!, appSecret: appSecret! }
}

async function graphFetch(url: URL | string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store", ...init })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const err = (body as { error?: { message?: string } })?.error
  if (!res.ok || err) {
    throw new Error(`Graph call failed (${res.status}): ${err?.message ?? res.statusText}`)
  }
  return body
}

// Swap the popup's `code` for a business access token. Meta returns a
// long-lived token here — unlike the 24h tokens the dashboard hands out.
export async function exchangeCodeForToken(code: string): Promise<string> {
  const { appId, appSecret } = appCredentials()
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`)
  url.searchParams.set("client_id", appId)
  url.searchParams.set("client_secret", appSecret)
  url.searchParams.set("code", code)

  const body = await graphFetch(url)
  const token = body.access_token
  if (typeof token !== "string") throw new Error("No access_token in exchange response")
  return token
}

export interface ConnectedNumber {
  displayPhoneNumber: string | null
  verifiedName: string | null
}

export async function getNumberDetails(
  phoneNumberId: string,
  accessToken: string
): Promise<ConnectedNumber> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}`)
  url.searchParams.set("fields", "display_phone_number,verified_name")
  url.searchParams.set("access_token", accessToken)

  const body = await graphFetch(url)
  return {
    displayPhoneNumber: (body.display_phone_number as string) ?? null,
    verifiedName: (body.verified_name as string) ?? null,
  }
}

// Stores (or refreshes) the connection. Keyed on phoneNumberId so reconnecting
// the same number updates the row instead of orphaning the old token.
export async function saveConnection(input: {
  wabaId: string
  phoneNumberId: string
  businessId?: string | null
  accessToken: string
  details: ConnectedNumber
  userId: string
  agentId: string | null
}) {
  const encrypted = encryptToken(input.accessToken)
  const data = {
    wabaId: input.wabaId,
    businessId: input.businessId ?? null,
    userId: input.userId,
    agentId: input.agentId,
    accessToken: encrypted,
    displayPhoneNumber: input.details.displayPhoneNumber,
    verifiedName: input.details.verifiedName,
  }
  return db.metaConnection.upsert({
    where: { phoneNumberId: input.phoneNumberId },
    create: { phoneNumberId: input.phoneNumberId, ...data },
    update: data,
  })
}

export async function getConnectionToken(phoneNumberId: string): Promise<string | null> {
  const row = await db.metaConnection.findUnique({
    where: { phoneNumberId },
    select: { accessToken: true },
  })
  return row ? decryptToken(row.accessToken) : null
}

// Finishes the handshake. Registration claims the number for Cloud API sending;
// the subscription is what makes Meta deliver ITS webhooks to us. Kept out of
// the connect route because both mutate a real phone number — the UI asks
// before calling this.
export async function activateConnection(phoneNumberId: string, pin: string) {
  const row = await db.metaConnection.findUnique({ where: { phoneNumberId } })
  if (!row) throw new Error(`No connection stored for phone number ${phoneNumberId}`)
  const accessToken = decryptToken(row.accessToken)

  await graphFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  })
  const registeredAt = new Date()

  await graphFetch(`https://graph.facebook.com/${GRAPH_VERSION}/${row.wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  return db.metaConnection.update({
    where: { phoneNumberId },
    data: { registeredAt, subscribedAt: new Date() },
  })
}
