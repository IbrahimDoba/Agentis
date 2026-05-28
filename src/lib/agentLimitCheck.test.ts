import { describe, it, expect } from "vitest"
import { shouldDisableMessaging } from "./agentLimitCheck"

describe("shouldDisableMessaging — truth table", () => {
  // Default: everything green — agent stays enabled.
  const ok = {
    subscriptionExpired: false,
    planExhausted: false,
    overageAllowed: false,
    walletBalance: 0,
  }

  it("keeps messaging enabled when everything is fine", () => {
    expect(shouldDisableMessaging(ok)).toBe(false)
  })

  it("disables when subscription is expired, regardless of credits", () => {
    expect(shouldDisableMessaging({ ...ok, subscriptionExpired: true })).toBe(true)
    expect(
      shouldDisableMessaging({
        ...ok,
        subscriptionExpired: true,
        walletBalance: 99999, // wallet doesn't save you from an expired sub
      })
    ).toBe(true)
  })

  it("keeps enabled when plan is exhausted but overage is allowed (Starter/Pro)", () => {
    expect(
      shouldDisableMessaging({ ...ok, planExhausted: true, overageAllowed: true })
    ).toBe(false)
  })

  it("disables when plan is exhausted AND no overage AND no wallet (Free/Basic OOC)", () => {
    expect(
      shouldDisableMessaging({ ...ok, planExhausted: true, overageAllowed: false, walletBalance: 0 })
    ).toBe(true)
  })

  it("KEEPS ENABLED when plan exhausted but the PAYG wallet has credits", () => {
    expect(
      shouldDisableMessaging({
        ...ok,
        planExhausted: true,
        overageAllowed: false,
        walletBalance: 100,
      })
    ).toBe(false)
  })

  it("wallet balance is ignored when overage is already allowed (overage rules)", () => {
    // Both protections, agent stays enabled.
    expect(
      shouldDisableMessaging({
        ...ok,
        planExhausted: true,
        overageAllowed: true,
        walletBalance: 5000,
      })
    ).toBe(false)
  })

  it("a wallet balance of exactly 0 counts as no credits", () => {
    expect(
      shouldDisableMessaging({
        ...ok,
        planExhausted: true,
        overageAllowed: false,
        walletBalance: 0,
      })
    ).toBe(true)
  })

  it("negative wallet balance is treated as no credits (defensive)", () => {
    expect(
      shouldDisableMessaging({
        ...ok,
        planExhausted: true,
        overageAllowed: false,
        walletBalance: -50,
      })
    ).toBe(true)
  })
})
