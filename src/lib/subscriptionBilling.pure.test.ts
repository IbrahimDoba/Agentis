import { describe, it, expect } from "vitest"
import {
  addOneMonth,
  nextExpiry,
  cycleReference,
  computeOverageNaira,
} from "./subscriptionBilling"

// Pure-function tests — no DB. These cover the money/date logic that's easy to
// get subtly wrong: expiry extension (don't lose paid days; reset on upgrade)
// and the overage charge math.

describe("addOneMonth", () => {
  it("advances the month", () => {
    expect(addOneMonth(new Date("2026-06-15T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-07-15")
  })
  it("rolls over the year boundary", () => {
    expect(addOneMonth(new Date("2026-12-10T00:00:00Z")).toISOString().slice(0, 7)).toBe("2027-01")
  })
})

describe("nextExpiry", () => {
  const now = new Date("2026-06-21T12:00:00Z")

  it("extends from a future expiry (renewing early keeps remaining days)", () => {
    const future = new Date("2026-07-01T00:00:00Z")
    expect(nextExpiry(future, now).toISOString().slice(0, 10)).toBe("2026-08-01")
  })

  it("extends from NOW when already expired", () => {
    const past = new Date("2026-06-01T00:00:00Z")
    expect(nextExpiry(past, now)).toEqual(addOneMonth(now))
  })

  it("extends from NOW when there's no current expiry (first subscribe)", () => {
    expect(nextExpiry(null, now)).toEqual(addOneMonth(now))
  })
})

describe("cycleReference", () => {
  it("is deterministic and carries the user + cycle date", () => {
    const d = new Date("2026-06-21T09:30:00Z")
    expect(cycleReference("user_abc", d)).toBe("DZ_SUB_user_abc_20260621")
    expect(cycleReference("user_abc", d)).toBe(cycleReference("user_abc", d))
  })
})

describe("computeOverageNaira", () => {
  it("is 0 when overage isn't allowed (rate null)", () => {
    expect(computeOverageNaira(99999, 25000, null)).toBe(0)
  })
  it("is 0 on unlimited plans (limit < 0)", () => {
    expect(computeOverageNaira(999999, -1, 800)).toBe(0)
  })
  it("is 0 under the limit", () => {
    expect(computeOverageNaira(60000, 60000, 1000)).toBe(0)
    expect(computeOverageNaira(10, 60000, 1000)).toBe(0)
  })
  it("charges per started 1,000 credits, rounded up (starter ₦1,000/1k)", () => {
    expect(computeOverageNaira(60001, 60000, 1000)).toBe(1000) // 1 credit over → 1 block
    expect(computeOverageNaira(60500, 60000, 1000)).toBe(1000)
    expect(computeOverageNaira(62000, 60000, 1000)).toBe(2000)
  })
  it("uses the plan's rate (pro ₦800/1k)", () => {
    expect(computeOverageNaira(105000, 100000, 800)).toBe(4000) // 5,000 over → 5 blocks
  })
})
