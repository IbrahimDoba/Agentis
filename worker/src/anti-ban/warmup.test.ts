import { describe, it, expect } from "vitest"
import { getTierConfig, shouldAdvanceTier, TIER_ADVANCE_DAYS, WARMUP_TIERS } from "./warmup.js"

describe("getTierConfig", () => {
  it("returns correct config for each tier", () => {
    expect(getTierConfig(1).maxPerDay).toBe(40)
    expect(getTierConfig(2).maxPerDay).toBe(150)
    expect(getTierConfig(3).maxPerDay).toBe(400)
    expect(getTierConfig(4).maxPerDay).toBe(1500)
  })

  it("falls back to tier 1 for unknown tier", () => {
    expect(getTierConfig(99).tier).toBe(1)
  })

  it("tier delays are in ascending order (stricter at lower tiers)", () => {
    const tiers = [1, 2, 3, 4].map(getTierConfig)
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].minDelayMs).toBeLessThan(tiers[i - 1].minDelayMs)
      expect(tiers[i].maxPerDay).toBeGreaterThan(tiers[i - 1].maxPerDay)
    }
  })
})

describe("shouldAdvanceTier", () => {
  it("returns false for tier 4", () => {
    expect(shouldAdvanceTier(4, new Date())).toBe(false)
  })

  it("returns false if not enough days have passed", () => {
    const recentStart = new Date(Date.now() - 1 * 86_400_000) // 1 day ago
    expect(shouldAdvanceTier(1, recentStart)).toBe(false) // requires 3 days
  })

  it("returns true when enough days have passed", () => {
    const tier1RequiredDays = TIER_ADVANCE_DAYS[1]
    const oldStart = new Date(Date.now() - (tier1RequiredDays + 1) * 86_400_000)
    expect(shouldAdvanceTier(1, oldStart)).toBe(true)
  })
})
