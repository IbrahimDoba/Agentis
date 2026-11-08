import { describe, it, expect } from "vitest"
import { getUserBillingState } from "./userBillingState"

const now = new Date("2026-11-08T12:00:00Z")
const past = "2026-10-01T00:00:00Z"
const future = "2027-10-01T00:00:00Z"

const free = {
  plan: "free",
  creditLimit: 1000,
  creditsUsed: 200,
  walletCreditsUsed: 0,
  creditBalance: 0,
  creditsExpireAt: null,
  subscriptionExpiresAt: null,
  now,
}

describe("getUserBillingState", () => {
  it("is on plan while inside the free allowance", () => {
    expect(getUserBillingState(free)).toBe("plan")
  })

  it("is pay as you go once usage spilled onto the wallet", () => {
    expect(getUserBillingState({ ...free, creditsUsed: 1400, walletCreditsUsed: 400 })).toBe("payg")
  })

  it("is pay as you go when the allowance is used up and a usable wallet will fund the next send", () => {
    expect(getUserBillingState({ ...free, creditsUsed: 1000, creditBalance: 500, creditsExpireAt: future })).toBe("payg")
  })

  it("is over limit when the allowance is used up and there is no wallet", () => {
    expect(getUserBillingState({ ...free, creditsUsed: 1200 })).toBe("over_limit")
  })

  it("treats an expired wallet as no wallet", () => {
    expect(getUserBillingState({ ...free, creditsUsed: 1200, creditBalance: 500, creditsExpireAt: past })).toBe("over_limit")
  })

  it("is pay as you go when a paid plan lapsed but the wallet is usable", () => {
    expect(getUserBillingState({ ...free, plan: "basic", creditLimit: 25000, subscriptionExpiresAt: past, creditBalance: 10 })).toBe("payg")
  })

  it("is expired when a paid plan lapsed with no wallet", () => {
    expect(getUserBillingState({ ...free, plan: "basic", creditLimit: 25000, subscriptionExpiresAt: past })).toBe("expired")
  })

  it("never exhausts an unlimited plan", () => {
    expect(getUserBillingState({ ...free, plan: "enterprise", creditLimit: -1, creditsUsed: 999999 })).toBe("plan")
  })

  it("keeps reseller users in their own bucket even though every send is wallet-funded", () => {
    expect(getUserBillingState({ ...free, plan: "reseller", creditLimit: 0, walletCreditsUsed: 50 })).toBe("reseller")
  })
})
