import { describe, it, expect } from "vitest"
import { leadsRate } from "./conversationStats"

describe("leadsRate", () => {
  it("returns null when there are no conversations to divide by", () => {
    expect(leadsRate(0, 0)).toBeNull()
    // The regression: an agent with leads but no conversations started in the
    // window used to render "0%", reading as "nothing converted".
    expect(leadsRate(2, 0)).toBeNull()
  })

  it("returns 0 when conversations converted none", () => {
    expect(leadsRate(0, 40)).toBe(0)
  })

  it("computes a whole-percent share", () => {
    expect(leadsRate(1, 4)).toBe(25)
    expect(leadsRate(26, 100)).toBe(26)
  })

  it("rounds to the nearest percent", () => {
    expect(leadsRate(1, 3)).toBe(33)
    expect(leadsRate(2, 3)).toBe(67)
  })

  it("reaches 100 when every conversation converted", () => {
    expect(leadsRate(9, 9)).toBe(100)
  })

  it("clamps mismatched cohorts instead of printing 1100%", () => {
    // Paparimz, live: 77 leads counted against 7 conversations started that week.
    expect(leadsRate(77, 7)).toBe(100)
    // Coffee Bar, live: 28 against 16.
    expect(leadsRate(28, 16)).toBe(100)
  })
})
