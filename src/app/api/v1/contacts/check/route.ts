import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { resolveApiCaller, requireAgentOwnership } from "@/lib/apiAuth"
import { apiError, newRequestId } from "@/lib/apiError"
import { checkApiRateLimit } from "@/lib/apiRateLimit"
import { baileysClient } from "@/lib/baileys-client"

// POST /api/v1/contacts/check — verify a phone number is reachable on WhatsApp
// before sending. Requires a "messages"-scoped key. Free (no credits charged).

const bodySchema = z.object({
  agentId: z.string().min(1),
  phone: z.string().min(5),
})

export async function POST(req: NextRequest) {
  const requestId = newRequestId()

  const auth = await resolveApiCaller(req, "messages")
  if (!auth.ok) return apiError(auth.code, auth.message, { requestId })

  const rate = await checkApiRateLimit(auth.caller.keyId)
  if (!rate.allowed) {
    return apiError("RATE_LIMITED", "Too many requests. Slow down and retry.", {
      requestId,
      headers: { "Retry-After": String(rate.retryAfterSec) },
    })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON body.", { requestId })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", { requestId })
  }
  const { agentId, phone } = parsed.data

  const ownership = await requireAgentOwnership(auth.caller.userId, agentId)
  if (ownership) return apiError(ownership, "Agent not found.", { requestId })

  try {
    const result = await baileysClient.checkContact(agentId, phone)
    return NextResponse.json(result) // { exists, jid }
  } catch {
    return apiError("AGENT_NOT_CONNECTED", "This agent's WhatsApp isn't connected.", { requestId })
  }
}
