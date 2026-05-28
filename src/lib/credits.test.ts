import { describe, it, expect } from "vitest"
import {
  creditsForTokens,
  findPaygTier,
  nextCreditExpiry,
  PAYG_TIERS,
  TOKENS_PER_CREDIT,
  OUTPUT_WEIGHT,
  CREDIT_EXPIRY_MONTHS,
} from "./credits"

describe("creditsForTokens", () => {
  it("returns at least 1 credit even for tiny calls (zero-ish round-trip)", () => {
    expect(creditsForTokens(0, 0)).toBe(1)
    expect(creditsForTokens(50, 10)).toBe(1)
  })

  it("scales linearly on input tokens", () => {
    expect(creditsForTokens(TOKENS_PER_CREDIT, 0)).toBe(1)
    expect(creditsForTokens(3 * TOKENS_PER_CREDIT, 0)).toBe(3)
  })

  it("weights output tokens by OUTPUT_WEIGHT (output is 4x more expensive)", () => {
    // 1000 output tokens = 4 credits (vs 1 credit for 1000 input)
    expect(creditsForTokens(0, TOKENS_PER_CREDIT)).toBe(OUTPUT_WEIGHT)
    // 250 output tokens = 1 credit
    expect(creditsForTokens(0, TOKENS_PER_CREDIT / OUTPUT_WEIGHT)).toBe(1)
  })

  it("mixes input + output correctly (matches the PAYG_ANALYSIS examples)", () => {
    // 500 in / 50 out → 500 + 200 = 700 weighted = 0 → floored, but min 1
    expect(creditsForTokens(500, 50)).toBe(1)
    // 500 in / 150 out → 500 + 600 = 1100 → 1 credit
    expect(creditsForTokens(500, 150)).toBe(1)
    // 500 in / 1500 out → 500 + 6000 = 6500 → 6 credits
    expect(creditsForTokens(500, 1500)).toBe(6)
    // 500 in / 3000 out → 500 + 12000 = 12500 → 12 credits
    expect(creditsForTokens(500, 3000)).toBe(12)
  })

  it("floors fractional credits (the user is never billed for a fraction)", () => {
    // 1500 weighted → 1.5 credits → floored to 1
    expect(creditsForTokens(1500, 0)).toBe(1)
  })

  it("clamps negative / NaN inputs to zero", () => {
    expect(creditsForTokens(-100, -50)).toBe(1) // min-1 floor still applies
    expect(creditsForTokens(NaN as unknown as number, NaN as unknown as number)).toBe(1)
  })

  it("handles large values without overflow", () => {
    const big = creditsForTokens(100_000, 50_000)
    // 100k + 200k = 300k weighted → 300 credits
    expect(big).toBe(300)
  })
})

describe("PAYG_TIERS", () => {
  it("is sorted by amount ascending", () => {
    for (let i = 1; i < PAYG_TIERS.length; i++) {
      expect(PAYG_TIERS[i].amountNaira).toBeGreaterThan(PAYG_TIERS[i - 1].amountNaira)
    }
  })

  it("unit rate decreases (or stays equal) as the pack gets bigger", () => {
    for (let i = 1; i < PAYG_TIERS.length; i++) {
      expect(PAYG_TIERS[i].ngnPerCredit).toBeLessThanOrEqual(PAYG_TIERS[i - 1].ngnPerCredit)
    }
  })

  it("credits roughly match amount ÷ unit-rate (tiers are rounded for marketing)", () => {
    // Tier credit counts are rounded to marketing-friendly numbers (3,200 not
    // 3,205.13); allow ±0.5% drift between the displayed rate and the math.
    for (const t of PAYG_TIERS) {
      const expected = t.amountNaira / t.ngnPerCredit
      const driftPct = Math.abs(t.credits - expected) / expected
      expect(driftPct).toBeLessThan(0.005)
    }
  })

  it("the ₦20,000 tier is the headline one (~13,000 credits)", () => {
    const t = findPaygTier(20000)
    expect(t).not.toBeNull()
    expect(t!.credits).toBe(13000)
  })
})

describe("findPaygTier", () => {
  it("returns the matching tier", () => {
    expect(findPaygTier(5000)?.credits).toBe(3200)
  })
  it("returns null for an amount that isn't a configured tier", () => {
    expect(findPaygTier(7500)).toBeNull()
    expect(findPaygTier(0)).toBeNull()
    expect(findPaygTier(-1000)).toBeNull()
  })
})

describe("nextCreditExpiry", () => {
  it("adds CREDIT_EXPIRY_MONTHS to now", () => {
    const now = new Date("2026-01-15T12:00:00Z")
    const expiry = nextCreditExpiry(now)
    expect(expiry.getUTCFullYear()).toBe(2027)
    expect(expiry.getUTCMonth()).toBe(0) // Jan → 12 months later → Jan
    expect(expiry.getUTCDate()).toBe(15)
  })

  it("doesn't mutate the input date", () => {
    const now = new Date("2026-01-15T12:00:00Z")
    const before = now.toISOString()
    nextCreditExpiry(now)
    expect(now.toISOString()).toBe(before)
  })

  it("the constant is sane (≥ 6 months, ≤ 24 months)", () => {
    expect(CREDIT_EXPIRY_MONTHS).toBeGreaterThanOrEqual(6)
    expect(CREDIT_EXPIRY_MONTHS).toBeLessThanOrEqual(24)
  })
})
