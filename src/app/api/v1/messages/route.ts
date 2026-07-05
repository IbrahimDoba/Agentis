import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { resolveApiCaller, requireAgentOwnership } from "@/lib/apiAuth"
import { apiError, newRequestId } from "@/lib/apiError"
import { recordApiKeySpend, isApiKeyDailyCapExceeded } from "@/lib/apiKey"
import { checkApiRateLimit } from "@/lib/apiRateLimit"
import { getAgentBillingContext, preflightApiCharge, getRemainingCredits } from "@/lib/apiBilling"
import { baileysClient } from "@/lib/baileys-client"
import { AI_CREDIT_COSTS } from "@/lib/plans"

// POST /api/v1/messages — Surface C of the External Developer API. Sends an
// outbound WhatsApp message from the developer's connected agent. Requires a
// "messages"-scoped key. Goes through the worker's anti-ban outbound pipeline
// (pacing + warmup limits) and bills per message (source='api').

const bodySchema = z.object({
  agentId: z.string().min(1),
  to: z.string().min(5), // E.164 digits (e.g. 2348012345678) or a full JID
  text: z.string().min(1).max(4096),
})

export async function POST(req: NextRequest) {
  const requestId = newRequestId()

  // 1. Auth (messages scope).
  const auth = await resolveApiCaller(req, "messages")
  if (!auth.ok) return apiError(auth.code, auth.message, { requestId })
  const keyId = auth.caller.keyId

  // 2. Rate limit (per key).
  const rate = await checkApiRateLimit(keyId)
  if (!rate.allowed) {
    return apiError("RATE_LIMITED", "Too many requests. Slow down and retry.", {
      requestId,
      headers: { "Retry-After": String(rate.retryAfterSec) },
    })
  }

  // 3. Parse + validate.
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
  const { agentId, to, text } = parsed.data

  // 4. Daily spending cap (per key).
  if (await isApiKeyDailyCapExceeded(keyId)) {
    return apiError("DAILY_CAP_HIT", "This key's daily spending cap has been reached.", { requestId })
  }

  // 5. Ownership (404 hides existence otherwise).
  const ownership = await requireAgentOwnership(auth.caller.userId, agentId)
  if (ownership) return apiError(ownership, "Agent not found.", { requestId })

  // 6. The agent's WhatsApp must be connected to send.
  let session: { status: string } | null = null
  try {
    session = await baileysClient.getSession(agentId)
  } catch {
    session = null
  }
  if (!session || session.status !== "CONNECTED") {
    return apiError("AGENT_NOT_CONNECTED", "This agent's WhatsApp isn't connected. Connect it before sending.", {
      requestId,
    })
  }

  // 7. Pre-flight credit check.
  const ctx = await getAgentBillingContext(agentId)
  if (!ctx) return apiError("AGENT_NOT_FOUND", "Agent not found.", { requestId })
  const pre = await preflightApiCharge(ctx)
  if (!pre.ok) {
    const message = pre.reason === "SUBSCRIPTION_EXPIRED" ? "Subscription expired." : "Insufficient credits."
    return apiError("INSUFFICIENT_CREDITS", message, { requestId })
  }

  // 8. Queue the send through the worker (it applies pacing/warmup + bills
  //    source='api', writing the CreditUsage row).
  let result: { jobId: string; status: string }
  try {
    result = await baileysClient.sendMessage({ agentId, to, text, source: "api" })
  } catch {
    return apiError("INTERNAL", "Couldn't queue the message. Please retry.", { requestId })
  }

  // 9. Track per-key spend for the rolling daily cap (worker did the ledger write).
  const credits = AI_CREDIT_COSTS.text
  await recordApiKeySpend(keyId, credits)
  const remaining = await getRemainingCredits(ctx)

  return NextResponse.json({
    message_id: result.jobId,
    status: result.status,
    usage: { credits },
    remaining_credits: remaining,
  })
}
