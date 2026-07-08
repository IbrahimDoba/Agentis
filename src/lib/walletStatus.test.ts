import { describe, it, expect } from "vitest"
import { hasUsableWallet } from "./walletStatus"

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
