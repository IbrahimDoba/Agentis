import { getMetaConfig } from "./cloud-api"

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0"

// Shared read helper for the harness's Graph calls. Graph returns errors as
// 200-with-error-body on some edges, so check both the HTTP status and the
// `error` key before trusting the payload.
export async function graphGet<T>(
  path: string,
  fields: string,
  // Explicit credentials for a connected customer's WABA. Omitted falls back to
  // the env-configured account (the platform's own number).
  opts?: { accessToken?: string; params?: Record<string, string> }
): Promise<T> {
  const accessToken = opts?.accessToken ?? getMetaConfig().accessToken
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`)
  url.searchParams.set("fields", fields)
  for (const [k, v] of Object.entries(opts?.params ?? {})) url.searchParams.set(k, v)
  url.searchParams.set("access_token", accessToken)

  const res = await fetch(url, { cache: "no-store" })
  const body = await res.json().catch(() => ({}))
  const err = (body as { error?: { message?: string } })?.error
  if (!res.ok || err) {
    throw new Error(`Graph GET ${path} failed (${res.status}): ${err?.message ?? res.statusText}`)
  }
  return body as T
}

// Write counterpart to graphGet. The token goes in the Authorization header
// rather than the query string so it can't end up in a proxy or access log.
export async function graphPost<T>(
  path: string,
  body: unknown,
  opts?: { accessToken?: string }
): Promise<T> {
  const accessToken = opts?.accessToken ?? getMetaConfig().accessToken
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  const err = (json as { error?: { message?: string; error_user_msg?: string } })?.error
  if (!res.ok || err) {
    // error_user_msg is the human-readable one Meta returns for template
    // rejections ("template name already exists" and friends) — prefer it.
    throw new Error(
      `Graph POST ${path} failed (${res.status}): ${err?.error_user_msg ?? err?.message ?? res.statusText}`
    )
  }
  return json as T
}

// Delete is its own verb rather than a graphPost variant: Meta takes the target
// in the query string, not the body.
export async function graphDelete(
  path: string,
  params: Record<string, string>,
  opts?: { accessToken?: string }
): Promise<void> {
  const accessToken = opts?.accessToken ?? getMetaConfig().accessToken
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("access_token", accessToken)

  const res = await fetch(url, { method: "DELETE", cache: "no-store" })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const err = (json as { error?: { message?: string; error_user_msg?: string } })?.error
  if (!res.ok || err) {
    throw new Error(
      `Graph DELETE ${path} failed (${res.status}): ${err?.error_user_msg ?? err?.message ?? res.statusText}`
    )
  }
}
