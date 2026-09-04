import dnsPromises from "node:dns/promises"
import { Agent as UndiciAgent, fetch as undiciFetch, type Dispatcher } from "undici"
import { validateCrawlUrl, isBlockedIp } from "./ip-guard.js"

// Fetching an operator-supplied URL, safely.
//
// The guard that matters is not "validate then fetch" — that re-resolves DNS
// inside the HTTP client and is genuinely exploitable via DNS rebinding: the
// name can answer with a public address for our check and a private one a
// moment later for the actual connection. So we resolve once, validate every
// returned address, then CONNECT TO THE ADDRESS WE VALIDATED by handing undici
// a fixed lookup. `servername` keeps TLS SNI and certificate validation pointed
// at the real hostname, so pinning costs us nothing in transport security.
//
// Every redirect hop repeats the whole check.

export const MAX_REDIRECTS = 5
export const MAX_BYTES = 2 * 1024 * 1024
export const REQUEST_TIMEOUT_MS = 10_000

export const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/xml",
  "application/xml",
]

export const CRAWL_USER_AGENT = "DailzeroBot/1.0 (+https://www.dailzero.com/bot)"

export type SafeFetchResult =
  | { ok: true; url: string; status: number; contentType: string; body: string }
  | { ok: false; reason: string; status?: number; url?: string }

interface Resolved {
  address: string
  family: number
}

export interface SafeFetchDeps {
  lookup: (hostname: string) => Promise<Resolved[]>
  makeDispatcher: (ip: string, family: number, servername: string) => Dispatcher
  fetchImpl: typeof undiciFetch
}

const defaultDeps: SafeFetchDeps = {
  lookup: async (hostname) => {
    const res = await dnsPromises.lookup(hostname, { all: true, verbatim: true })
    return res.map((r) => ({ address: r.address, family: r.family }))
  },
  makeDispatcher: (ip, family, servername) =>
    new UndiciAgent({
      connect: {
        // Hand undici the address we already validated instead of letting it
        // resolve the name again. This is what closes the rebinding window.
        lookup: (_hostname, _options, cb) => cb(null, [{ address: ip, family }] as never),
        servername,
      },
      headersTimeout: REQUEST_TIMEOUT_MS,
      bodyTimeout: REQUEST_TIMEOUT_MS,
    }),
  fetchImpl: undiciFetch,
}

export interface SafeFetchOptions {
  /** Lets a crawl deadline cancel an in-flight request. */
  signal?: AbortSignal
  maxBytes?: number
}

function charsetOf(contentType: string): string {
  const m = contentType.match(/charset=([^;]+)/i)
  const cs = m?.[1]?.trim().replace(/^["']|["']$/g, "").toLowerCase()
  // Anything exotic falls back to utf-8 rather than throwing.
  if (!cs || cs === "utf8") return "utf-8"
  return cs
}

/** Release an unread body so the connection can be returned to the pool. */
function discard(res: { body?: unknown }): void {
  const body = res.body as { cancel?: () => Promise<void> } | null | undefined
  void body?.cancel?.().catch(() => {})
}

/** Read a response body, aborting the moment it exceeds the cap. */
async function readCapped(
  res: { body: unknown; headers: { get(name: string): string | null } },
  cap: number,
  contentType: string
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const declared = Number(res.headers.get("content-length") ?? "")
  // Cheap rejection before we stream a byte. Not trusted on its own.
  if (Number.isFinite(declared) && declared > cap) return { ok: false, reason: "body_too_large" }

  const body = res.body as ReadableStream<Uint8Array> | null
  if (!body) return { ok: true, text: "" }

  const reader = body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > cap) {
        await reader.cancel().catch(() => {})
        return { ok: false, reason: "body_too_large" }
      }
      parts.push(value)
    }
  } finally {
    reader.releaseLock?.()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    merged.set(p, offset)
    offset += p.byteLength
  }
  // An unknown or malformed charset label makes TextDecoder throw RangeError,
  // which would escape the "never throws for a bad site" contract.
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(charsetOf(contentType), { fatal: false })
  } catch {
    decoder = new TextDecoder("utf-8", { fatal: false })
  }
  return { ok: true, text: decoder.decode(merged) }
}

/**
 * Fetch a user-supplied URL with SSRF protection. Returns the decoded body, or
 * a machine-readable reason for the refusal — never throws for a blocked URL.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
  deps: Partial<SafeFetchDeps> = {}
): Promise<SafeFetchResult> {
  const d: SafeFetchDeps = { ...defaultDeps, ...deps }
  const cap = opts.maxBytes ?? MAX_BYTES

  let current = rawUrl
  const visited = new Set<string>()

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateCrawlUrl(current)
    if (!check.ok) return { ok: false, reason: check.reason, url: current }
    const url = check.url

    if (visited.has(url.toString())) return { ok: false, reason: "redirect_loop", url: current }
    visited.add(url.toString())

    // Resolve, then reject if ANY answer is blocked. Picking a "good" address
    // out of a mixed answer would be exactly the bypass a hostile DNS wants.
    let addresses: Resolved[]
    try {
      addresses = await d.lookup(url.hostname)
    } catch {
      return { ok: false, reason: "dns_failure", url: current }
    }
    if (addresses.length === 0) return { ok: false, reason: "dns_no_answer", url: current }
    for (const a of addresses) {
      const blocked = isBlockedIp(a.address)
      if (blocked) return { ok: false, reason: blocked, url: current }
    }

    // Every address here is already validated. Prefer IPv4: the orchestrator's
    // docker network has no IPv6 route, so pinning a leading AAAA record (which
    // verbatim:true preserves) would fail ENETUNREACH on a perfectly good host.
    const pinned = addresses.find((a) => a.family === 4) ?? addresses[0]
    const dispatcher = d.makeDispatcher(pinned.address, pinned.family, url.hostname)

    let res: Awaited<ReturnType<typeof undiciFetch>>
    try {
      res = await d.fetchImpl(url.toString(), {
        method: "GET",
        redirect: "manual",
        // Combine, don't replace: the crawl deadline and the per-request timeout
        // are different guarantees, and the crawler always supplies the former.
        signal: opts.signal
          ? AbortSignal.any([opts.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        dispatcher,
        headers: {
          "User-Agent": CRAWL_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "Accept-Language": "en",
        },
      } as Parameters<typeof undiciFetch>[1])
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError" || (err as Error)?.name === "TimeoutError"
      return { ok: false, reason: aborted ? "timeout" : "fetch_failed", url: current }
    } finally {
      // Undici pools connections per dispatcher; a per-hop dispatcher must be
      // closed or the process leaks sockets across a 25-page crawl.
      void (dispatcher as { close?: () => Promise<void> }).close?.()?.catch(() => {})
    }

    if (res.status >= 300 && res.status < 400) {
      discard(res)
      const location = res.headers.get("location")
      if (!location) return { ok: false, reason: "redirect_without_location", status: res.status, url: current }
      // Relative Location resolves against THIS hop, not the original URL.
      current = new URL(location, url).toString()
      continue
    }

    if (!res.ok) {
      discard(res)
      return { ok: false, reason: "http_error", status: res.status, url: url.toString() }
    }

    const contentType = res.headers.get("content-type") ?? ""
    const base = contentType.split(";")[0].trim().toLowerCase()
    if (!ALLOWED_CONTENT_TYPES.includes(base)) {
      // Refuse before reading the body — we never want to buffer a video — but
      // still release it so the socket is not pinned until bodyTimeout.
      discard(res)
      return { ok: false, reason: "unsupported_content_type", status: res.status, url: url.toString() }
    }

    const read = await readCapped(res, cap, contentType)
    if (!read.ok) return { ok: false, reason: read.reason, status: res.status, url: url.toString() }

    return { ok: true, url: url.toString(), status: res.status, contentType: base, body: read.text }
  }

  return { ok: false, reason: "too_many_redirects", url: current }
}
