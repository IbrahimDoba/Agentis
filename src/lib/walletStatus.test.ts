import { describe, it, expect } from "vitest"
import { hasUsableWallet, paygTakeover } from "./walletStatus"

describe("hasUsableWallet", () => {
  const now = new Date("2026-07-08T00:00:00Z")
  const future = new Date("2026-12-01T00:00:00Z")
  const past = new Date("2026-01-01T00:00:00Z")

  it("is false when the balance is zero or negative", () => {
    expect(hasUsableWallet(0, future, now)).toBe(false)
    expect(hasUsableWallet(-100, future, now)).toBe(false)
    expect(hasUsableWallet(null, future, now)).toBe(false)
    expect(hasUsableWallet(undefined, future, now)).toBe(false)
  })

  it("is true when balance is positive and expiry is in the future", () => {
    expect(hasUsableWallet(500, future, now)).toBe(true)
    expect(hasUsableWallet(500, future.toISOString(), now)).toBe(true)
  })

  it("is false when the credits have expired", () => {
    expect(hasUsableWallet(500, past, now)).toBe(false)
    expect(hasUsableWallet(500, now, now)).toBe(false) // exactly now = expired
  })

  it("treats a null expiry as never-expiring (matches deductFromWallet)", () => {
    expect(hasUsableWallet(500, null, now)).toBe(true)
    expect(hasUsableWallet(500, undefined, now)).toBe(true)
  })
})

describe("paygTakeover — when the PAYG bar replaces the plan bar", () => {
  const now = new Date("2026-07-08T00:00:00Z")
  const future = new Date("2026-12-01T00:00:00Z")
  const past = new Date("2026-01-01T00:00:00Z")
  const base = { creditBalance: 500, creditsExpireAt: future, now }

  it("plan alive with room → plan keeps the bar", () => {
    expect(paygTakeover({ ...base, subscriptionExpiresAt: future, monthlyCreditsUsed: 100, creditLimit: 1000 })).toBe(false)
  })

  it("plan allowance exhausted + usable wallet → PAYG takes over", () => {
    expect(paygTakeover({ ...base, subscriptionExpiresAt: future, monthlyCreditsUsed: 1000, creditLimit: 1000 })).toBe(true)
    expect(paygTakeover({ ...base, subscriptionExpiresAt: future, monthlyCreditsUsed: 1200, creditLimit: 1000 })).toBe(true)
  })

  it("plan/trial expired + usable wallet → PAYG takes over", () => {
    expect(paygTakeover({ ...base, subscriptionExpiresAt: past, monthlyCreditsUsed: 100, creditLimit: 1000 })).toBe(true)
  })

  it("no usable wallet → never takes over (red/expired state remains)", () => {
    expect(paygTakeover({ creditBalance: 0, creditsExpireAt: future, now, subscriptionExpiresAt: past, monthlyCreditsUsed: 1000, creditLimit: 1000 })).toBe(false)
    expect(paygTakeover({ creditBalance: 500, creditsExpireAt: past, now, subscriptionExpiresAt: past, monthlyCreditsUsed: 1000, creditLimit: 1000 })).toBe(false)
  })

  it("unlimited plan never hands the bar to PAYG", () => {
    expect(paygTakeover({ ...base, subscriptionExpiresAt: past, monthlyCreditsUsed: 99999, creditLimit: -1 })).toBe(false)
  })

  it("no subscription expiry (never-started trial) with a zero-limit or exhausted plan → PAYG shows", () => {
    expect(paygTakeover({ ...base, subscriptionExpiresAt: null, monthlyCreditsUsed: 1000, creditLimit: 1000 })).toBe(true)
  })
})
