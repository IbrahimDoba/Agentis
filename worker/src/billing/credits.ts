// Legacy flat per-type rates — used as the FALLBACK when an AI send arrives
// without LLM token counts (e.g. a broadcast template, a follow-up message,
// or any non-orchestrator AI path). The orchestrator's LLM replies use the
// token-weighted creditsForTokens() below.
export const AI_CREDIT_COSTS = {
  text: 5,
  image: 8,
  voicePerSec: 3,
  voiceMin: 15, // minimum credits charged per voice note regardless of length
} as const

// Token-weighted accounting. Mirrors src/lib/credits.ts (Next.js) — kept in
// sync intentionally; both must agree on the credit unit. See PAYG_ANALYSIS.md
// §3 for the derivation (1 credit = 1,000 weighted tokens; output = 4×).
export const TOKENS_PER_CREDIT = 1000
export const OUTPUT_WEIGHT = 4

export function creditsForTokens(inputTokens: number, outputTokens: number): number {
  const safeIn = Math.max(0, Math.floor(inputTokens || 0))
  const safeOut = Math.max(0, Math.floor(outputTokens || 0))
  const weighted = safeIn + safeOut * OUTPUT_WEIGHT
  return Math.max(1, Math.floor(weighted / TOKENS_PER_CREDIT))
}

export const PLAN_CREDIT_LIMITS: Record<string, number> = {
  free: 2000,
  basic: 25000,
  starter: 60000,
  pro: 100000,
  enterprise: -1,
}

export const PLAN_OVERAGE_RATE_PER_1K: Record<string, number | null> = {
  free: null,
  starter: 1000,
  pro: 800,
  enterprise: null,
}

export function creditsForMessageType(type?: "text" | "image"): number {
  return type === "image" ? AI_CREDIT_COSTS.image : AI_CREDIT_COSTS.text
}

export function creditsForVoice(durationSeconds: number): number {
  return Math.max(AI_CREDIT_COSTS.voiceMin, Math.ceil(durationSeconds) * AI_CREDIT_COSTS.voicePerSec)
}

export function allowsOverage(plan: string): boolean {
  return PLAN_OVERAGE_RATE_PER_1K[plan] !== null
}
