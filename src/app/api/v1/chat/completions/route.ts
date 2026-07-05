import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { resolveApiCaller, requireAgentOwnership } from "@/lib/apiAuth"
import { apiError, newRequestId } from "@/lib/apiError"
import { recordApiKeySpend, isApiKeyDailyCapExceeded } from "@/lib/apiKey"
import { checkApiRateLimit } from "@/lib/apiRateLimit"
import { getIdempotentResponse, storeIdempotentResponse } from "@/lib/apiIdempotency"
import {
  getAgentBillingContext,
  preflightApiCharge,
  chargeApiTurn,
  getRemainingCredits,
} from "@/lib/apiBilling"
import { callOrchestratorChat, OrchestratorChatError } from "@/lib/orchestrator-chat"

// POST /api/v1/chat/completions — Surface A of the External Developer API.
// Auth with a "chat"-scoped API key; runs the developer's agent on the shared
// orchestrator engine and bills the turn against the same credits as WhatsApp.

const MAX_MESSAGES = 50
const MAX_TOTAL_CHARS = 32_000

const bodySchema = z.object({
  agentId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1)
    .max(MAX_MESSAGES),
  // Optional: stable id to thread a multi-turn conversation; echoed back.
  metadata: z.object({ conversation_id: z.string().optional() }).optional(),
})

export async function POST(req: NextRequest) {
  const requestId = newRequestId()

  // 1. Authenticate (chat scope).
  const auth = await resolveApiCaller(req, "chat")
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

  // 3. Idempotency replay — if this (key, Idempotency-Key) already produced a
  // response, return it without re-running or re-charging.
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null
  if (idempotencyKey) {
    const cached = await getIdempotentResponse(keyId, idempotencyKey)
    if (cached) return NextResponse.json(cached, { headers: { "Idempotency-Replayed": "true" } })
  }

  // 4. Parse + validate.
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
  const { agentId, messages, metadata } = parsed.data

  const totalChars = messages.reduce((n, m) => n + m.content.length, 0)
  if (totalChars > MAX_TOTAL_CHARS) {
    return apiError("BAD_REQUEST", `Messages exceed the ${MAX_TOTAL_CHARS}-character limit.`, { requestId })
  }

  // 5. Daily spending cap (per key) — block at the limit before doing work.
  if (await isApiKeyDailyCapExceeded(keyId)) {
    return apiError("DAILY_CAP_HIT", "This key's daily spending cap has been reached.", { requestId })
  }

  // 6. The agent must belong to the key's owner (404 hides existence otherwise).
  const ownership = await requireAgentOwnership(auth.caller.userId, agentId)
  if (ownership) return apiError(ownership, "Agent not found.", { requestId })

  // 7. Billing context + pre-flight (don't run the LLM if they can't pay).
  const ctx = await getAgentBillingContext(agentId)
  if (!ctx) return apiError("AGENT_NOT_FOUND", "Agent not found.", { requestId })
  const pre = await preflightApiCharge(ctx)
  if (!pre.ok) {
    const message = pre.reason === "SUBSCRIPTION_EXPIRED" ? "Subscription expired." : "Insufficient credits."
    return apiError("INSUFFICIENT_CREDITS", message, { requestId })
  }

  // 8. Run the turn on the shared orchestrator engine.
  let result
  try {
    result = await callOrchestratorChat({
      agentId,
      messages,
      conversationId: metadata?.conversation_id,
    })
  } catch (err) {
    if (err instanceof OrchestratorChatError && err.status === 404) {
      return apiError("AGENT_NOT_FOUND", "Agent is not configured for chat.", { requestId })
    }
    return apiError("INTERNAL", "The agent engine is temporarily unavailable.", { requestId })
  }

  if (!result.reply) {
    return apiError("INTERNAL", "The agent did not produce a reply.", { requestId })
  }

  // 9. Bill the actual usage (same ledger as WhatsApp; source='api').
  const charge = await chargeApiTurn({
    agentId,
    conversationId: result.conversationId,
    ctx,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  })

  // 10. Track per-key spend for the rolling daily cap.
  await recordApiKeySpend(keyId, charge.credits)

  const remaining = await getRemainingCredits(ctx)

  const responseBody = {
    message: { role: "assistant", content: result.reply },
    usage: {
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      credits: charge.credits,
    },
    remaining_credits: remaining,
    metadata: metadata ?? null,
  }

  // 11. Cache for idempotent replay (best-effort).
  if (idempotencyKey) await storeIdempotentResponse(keyId, idempotencyKey, responseBody)

  return NextResponse.json(responseBody)
}
