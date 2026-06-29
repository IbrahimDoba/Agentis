import { describe, it, expect } from "vitest"
import { getTrialState, isFreeTrialExpired, isTrialPlan, TRIAL_DAYS } from "./trial"

const DAY_MS = 24 * 60 * 60 * 1000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)
const past = (days: number) => new Date(Date.now() - days * DAY_MS)

describe("trial gate", () => {
  it("excludes reseller-tenant users (never trial-gated)", () => {
    const u = { plan: "free", resellerId: "r_123", subscriptionExpiresAt: past(1) }
    expect(isTrialPlan(u.plan, u.resellerId)).toBe(false)
    expect(getTrialState(u).status).toBe("none")
    expect(isFreeTrialExpired(u)).toBe(false)
  })

  it("excludes paid plans", () => {
    const u = { plan: "pro", resellerId: "platform", subscriptionExpiresAt: past(1) }
    expect(getTrialState(u).status).toBe("none")
    expect(isFreeTrialExpired(u)).toBe(false)
  })

  it("platform free with no deadline is pending (trial not started)", () => {
    const u = { plan: "free", resellerId: "platform", subscriptionExpiresAt: null }
    expect(getTrialState(u).status).toBe("pending")
    expect(isFreeTrialExpired(u)).toBe(false)
  })

  it("platform free with a future deadline is active with days left", () => {
    const u = { plan: "free", resellerId: "platform", subscriptionExpiresAt: future(3) }
    const state = getTrialState(u)
    expect(state.status).toBe("active")
    if (state.status === "active") expect(state.daysLeft).toBeGreaterThan(0)
    expect(isFreeTrialExpired(u)).toBe(false)
  })

  it("platform free with a past deadline is expired (the wall)", () => {
    const u = { plan: "free", resellerId: "platform", subscriptionExpiresAt: past(1) }
    expect(getTrialState(u).status).toBe("expired")
    expect(isFreeTrialExpired(u)).toBe(true)
  })

  it("defaults (null plan / null reseller) are treated as platform free", () => {
    expect(isTrialPlan(null, null)).toBe(true)
    expect(TRIAL_DAYS).toBe(7)
  })
})
