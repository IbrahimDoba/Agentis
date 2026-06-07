import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { resolveApiCaller, type ApiCaller } from "@/lib/apiAuth"
import { apiError, newRequestId } from "@/lib/apiError"
import { checkApiRateLimit } from "@/lib/apiRateLimit"

// Shared front-door for Surface B (management) routes: authenticate the
// "manage"-scoped key and apply the per-key rate limit. Returns either the
// resolved caller (+ requestId) or a ready-to-return error response.
export async function guardManageRequest(
  req: NextRequest
): Promise<{ ok: true; caller: ApiCaller; requestId: string } | { ok: false; response: NextResponse }> {
  const requestId = newRequestId()

  const auth = await resolveApiCaller(req, "manage")
  if (!auth.ok) return { ok: false, response: apiError(auth.code, auth.message, { requestId }) }

  const rate = await checkApiRateLimit(auth.caller.keyId)
  if (!rate.allowed) {
    return {
      ok: false,
      response: apiError("RATE_LIMITED", "Too many requests. Slow down and retry.", {
        requestId,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      }),
    }
  }

  return { ok: true, caller: auth.caller, requestId }
}
