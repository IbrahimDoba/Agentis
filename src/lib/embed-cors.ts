import { NextRequest, NextResponse } from "next/server"

// Allow-all standard headers that browser clients need. We deliberately do
// NOT set Authorization in here — embed routes are public-by-design and
// authenticated via publicKey + origin instead.
const ALLOWED_HEADERS = "Content-Type"
const ALLOWED_METHODS = "GET,POST,OPTIONS"

// Origin check is exact-match against EmbedSite.allowedOrigins (no wildcards
// in v1). Origins are stored full-qualified (scheme + host + optional port).
export function isAllowedOrigin(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (!origin) return false
  return allowed.some((o) => o.trim() === origin)
}

// Build the CORS headers to attach to every response from an embed route.
// When the origin is allowed we echo it back (so credentials would work if
// we ever needed them); when not, no Access-Control-Allow-Origin is set and
// the browser will block the response.
export function corsHeadersFor(origin: string | null | undefined, allowed: readonly string[]): Record<string, string> {
  const allowOrigin = isAllowedOrigin(origin, allowed) ? origin! : ""
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}

// Standard OPTIONS handler — preflight always echoes the request's Origin
// back as Access-Control-Allow-Origin. We can't do per-key allowlist
// validation here because the browser doesn't send the publicKey in
// preflight (no body, no custom header until the real request). The real
// authorization happens on the actual POST/GET handler, which inspects the
// publicKey, looks up the EmbedSite, and returns the response WITHOUT an
// allow header if the origin isn't in the per-site allowlist. The browser
// then blocks the response. Preflight is just "yes this method+headers
// shape is allowed in principle" — not the security gate.
export function preflight(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin") || ""
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  })
}

// Helper to wrap a JSON response with the right CORS headers for an embed
// request. Pass the matching EmbedSite's allowedOrigins; the function will
// echo the origin back only if it's in the allowlist.
export function corsJson(
  data: unknown,
  init: { status?: number; origin: string | null; allowedOrigins: readonly string[] }
): NextResponse {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: corsHeadersFor(init.origin, init.allowedOrigins),
  })
}
