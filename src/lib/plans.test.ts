import { describe, it, expect } from "vitest"
import { effectiveCreditLimit } from "./plans"

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
