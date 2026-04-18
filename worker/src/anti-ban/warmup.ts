export interface WarmupTierConfig {
  tier: number
  maxPerDay: number
  maxPerHour: number
  minDelayMs: number
  maxDelayMs: number
}

export const WARMUP_TIERS: Record<number, WarmupTierConfig> = {
  1: { tier: 1, maxPerDay: 40,   maxPerHour: 8,   minDelayMs: 45_000,  maxDelayMs: 90_000  },
  2: { tier: 2, maxPerDay: 150,  maxPerHour: 25,  minDelayMs: 20_000,  maxDelayMs: 45_000  },
  3: { tier: 3, maxPerDay: 400,  maxPerHour: 60,  minDelayMs: 10_000,  maxDelayMs: 25_000  },
  4: { tier: 4, maxPerDay: 1500, maxPerHour: 200, minDelayMs: 5_000,   maxDelayMs: 15_000  },
}

// Hard caps that override tier limits (§7.10)
export const HARD_CAPS = {
  maxPerDay: 2000,
  maxPerHour: 300,
  maxNewContactsPerDay: 50,
}

export function getTierConfig(tier: number): WarmupTierConfig {
  return WARMUP_TIERS[tier] ?? WARMUP_TIERS[1]
}

/**
 * Days required at a tier before advancing.
 */
export const TIER_ADVANCE_DAYS: Record<number, number> = {
  1: 3,
  2: 7,
  3: 21,
}

export function shouldAdvanceTier(currentTier: number, warmupStartedAt: Date): boolean {
  if (currentTier >= 4) return false
  const daysRequired = TIER_ADVANCE_DAYS[currentTier]
  const daysSince = (Date.now() - warmupStartedAt.getTime()) / 86_400_000
  return daysSince >= daysRequired
}
