import { describe, it, expect } from "vitest"
import {
  PLAN_ORDER,
  PLAN_PRICES,
  planRank,
  isPlanUpgrade,
  isPlanDowngrade,
} from "./plans"

// PLAN_ORDER.indexOf() answered -1 for the "reseller" plan, and -1 compares as
// cheaper than "free". That made every card on the subscription page read
// "Upgrade" for those users, and stopped checkout scheduling a downgrade —
// an active subscriber was charged immediately instead of at renewal.
describe("plan ranking", () => {
  it("ranks the self-serve ladder in ascending order", () => {
    const ranks = PLAN_ORDER.map((p) => planRank(p))
    expect(ranks).toEqual([...ranks].sort((a, b) => a! - b!))
    expect(ranks.every((r) => r !== null)).toBe(true)
  })

  it("returns null for a plan that is not on the ladder", () => {
    expect(planRank("reseller")).toBeNull()
    expect(planRank("payg")).toBeNull()
    expect(planRank("")).toBeNull()
    expect(planRank(null)).toBeNull()
    expect(planRank(undefined)).toBeNull()
  })

  it("compares normal plans the way the ladder reads", () => {
    expect(isPlanUpgrade("basic", "pro")).toBe(true)
    expect(isPlanDowngrade("pro", "basic")).toBe(true)
    expect(isPlanUpgrade("free", "enterprise")).toBe(true)
  })

  it("treats a plan as neither above nor below itself", () => {
    for (const p of PLAN_ORDER) {
      expect(isPlanUpgrade(p, p)).toBe(false)
      expect(isPlanDowngrade(p, p)).toBe(false)
    }
  })

  it("calls an off-ladder plan not comparable, rather than cheapest", () => {
    // The regression: -1 arithmetic made every target look like an upgrade.
    for (const p of PLAN_ORDER) {
      expect(isPlanUpgrade("reseller", p)).toBe(false)
      expect(isPlanDowngrade("reseller", p)).toBe(false)
      expect(isPlanUpgrade(p, "reseller")).toBe(false)
      expect(isPlanDowngrade(p, "reseller")).toBe(false)
    }
  })

  it("never reports a pair as both an upgrade and a downgrade", () => {
    const plans = [...PLAN_ORDER, "reseller", "payg", ""]
    for (const a of plans) {
      for (const b of plans) {
        expect(isPlanUpgrade(a, b) && isPlanDowngrade(a, b)).toBe(false)
      }
    }
  })

  it("documents which priced plans sit off the self-serve ladder", () => {
    // Guards the drift that caused this: a plan gains a price but no rung, and
    // the -1 comparison silently misclassifies it. Update deliberately.
    const offLadder = Object.keys(PLAN_PRICES).filter((p) => planRank(p) === null)
    expect(offLadder).toEqual(["reseller"])
  })
})
