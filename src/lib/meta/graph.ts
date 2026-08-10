import { getMetaConfig } from "./cloud-api"

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0"

// Shared read helper for the harness's Graph calls. Graph returns errors as
// 200-with-error-body on some edges, so check both the HTTP status and the
// `error` key before trusting the payload.
export async function graphGet<T>(path: string, fields: string): Promise<T> {
  const { accessToken } = getMetaConfig()
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`)
  url.searchParams.set("fields", fields)
  url.searchParams.set("access_token", accessToken)

  const res = await fetch(url, { cache: "no-store" })
  const body = await res.json().catch(() => ({}))
  const err = (body as { error?: { message?: string } })?.error
  if (!res.ok || err) {
    throw new Error(`Graph GET ${path} failed (${res.status}): ${err?.message ?? res.statusText}`)
  }
  return body as T
}
