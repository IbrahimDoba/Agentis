import { describe, it, expect } from "vitest"
import { effectiveCreditLimit, carryoverForNextCycle } from "./plans"

const future = new Date(Date.now() + 5 * 86_400_000)
const past = new Date(Date.now() - 5 * 86_400_000)

describe("effectiveCreditLimit (one-cycle carryover)", () => {
  it("adds a still-valid carryover on top of the base", () => {
    // basic (14k unused) -> starter: 60k + 14k = 74k this cycle
    expect(effectiveCreditLimit(60000, 14000, future)).toBe(74000)
  })

  it("ignores an expired carryover (back to base at next cycle)", () => {
    expect(effectiveCreditLimit(60000, 14000, past)).toBe(60000)
  })

  it("returns the base when there's no carryover", () => {
    expect(effectiveCreditLimit(60000, 0, future)).toBe(60000)
    expect(effectiveCreditLimit(60000, null, null)).toBe(60000)
    expect(effectiveCreditLimit(60000, undefined, undefined)).toBe(60000)
  })

  it("keeps unlimited (-1) unlimited regardless of carryover", () => {
    expect(effectiveCreditLimit(-1, 14000, future)).toBe(-1)
  })

  it("treats a positive carryover with no expiry as non-expiring", () => {
    expect(effectiveCreditLimit(60000, 14000, null)).toBe(74000)
  })

  it("accepts ISO-string expiries (as the DB/JSON returns them)", () => {
    expect(effectiveCreditLimit(25000, 5000, future.toISOString())).toBe(30000)
    expect(effectiveCreditLimit(25000, 5000, past.toISOString())).toBe(25000)
  })
})

describe("carryoverForNextCycle (25% capped rollover)", () => {
  it("caps at 25% of the base allowance", () => {
    // Basic 25k, only 5k used -> 20k unused, capped to 6,250
    expect(carryoverForNextCycle(25000, 5000, 25000)).toBe(6250)
    // Starter 60k -> 15,000; Pro 100k -> 25,000
    expect(carryoverForNextCycle(60000, 0, 60000)).toBe(15000)
    expect(carryoverForNextCycle(100000, 0, 100000)).toBe(25000)
  })

  it("rolls the full unused when it's under the cap", () => {
    // 22k of 25k used -> 3k unused, below the 6,250 cap
    expect(carryoverForNextCycle(25000, 22000, 25000)).toBe(3000)
  })

  it("is 0 when nothing is unused (or over-used)", () => {
    expect(carryoverForNextCycle(25000, 25000, 25000)).toBe(0)
    expect(carryoverForNextCycle(25000, 30000, 25000)).toBe(0)
  })

  it("caps against the BASE, not the effective limit (no compounding)", () => {
    // effective 31,250 (25k + a 6,250 prior carryover), 5k used -> 26,250 unused,
    // still capped to 6,250 of the base.
    expect(carryoverForNextCycle(31250, 5000, 25000)).toBe(6250)
  })

  it("is 0 for unlimited / zero-base plans", () => {
    expect(carryoverForNextCycle(-1, 0, -1)).toBe(0)
    expect(carryoverForNextCycle(0, 0, 0)).toBe(0)
  })
})
