export const AI_CREDIT_COSTS = {
  text: 5,
  image: 8,
  voicePerSec: 3,
  voiceMin: 15, // minimum credits charged per voice note regardless of length
} as const

export const PLAN_CREDIT_LIMITS: Record<string, number> = {
  free: 2000,
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
