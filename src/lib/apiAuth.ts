import type { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { verifyApiKey, touchApiKey, type ApiKeyScope } from "@/lib/apiKey"

// Authentication + authorization for the External Developer API.
//
// resolveApiCaller() is the single entry point every /v1 route calls first: it
// turns a Bearer API key into a { userId, keyId, scopes } caller (or a typed
// failure the route maps to apiError()). It also enforces the route's required
// scope, so a "chat"-only key can't reach "manage" endpoints.

export interface ApiCaller {
  userId: string
  keyId: string
  scopes: string[]
}

export type ApiAuthResult =
  | { ok: true; caller: ApiCaller }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN_SCOPE"; message: string }

// Pull a Bearer token out of the Authorization header, if present and non-empty.
function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization")
  if (!header || !header.startsWith("Bearer ")) return null
  const token = header.slice("Bearer ".length).trim()
  return token.length > 0 ? token : null
}

// Authenticate an API request and enforce the required scope. Stamps the key's
// lastUsedAt best-effort (never blocks the request). Returns a discriminated
// result the route turns into an apiError() or proceeds with the caller.
export async function resolveApiCaller(
  req: NextRequest,
  requiredScope: ApiKeyScope
): Promise<ApiAuthResult> {
  const token = bearerToken(req)
  if (!token) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "Missing or malformed Authorization header. Use: Authorization: Bearer <api-key>.",
    }
  }

  const key = await verifyApiKey(token)
  if (!key) {
    return { ok: false, code: "UNAUTHORIZED", message: "Invalid or revoked API key." }
  }

  if (!key.scopes.includes(requiredScope)) {
    return {
      ok: false,
      code: "FORBIDDEN_SCOPE",
      message: `This API key lacks the "${requiredScope}" scope.`,
    }
  }

  // Fire-and-forget; a failed timestamp write must not fail the request.
  void touchApiKey(key.id).catch(() => {})

  return { ok: true, caller: { userId: key.userId, keyId: key.id, scopes: key.scopes } }
}

// Confirm an agent exists AND belongs to the caller. Collapses "doesn't exist"
// and "not yours" into the same AGENT_NOT_FOUND so a developer can't probe which
// agentIds exist on the platform. Returns null when access is allowed.
export async function requireAgentOwnership(
  userId: string,
  agentId: string
): Promise<"AGENT_NOT_FOUND" | null> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  })
  if (!agent || agent.userId !== userId) return "AGENT_NOT_FOUND"
  return null
}
