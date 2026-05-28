import { describe, it, expect } from "vitest"
import { shouldRetryReconnect, MAX_RECONNECT_ATTEMPTS } from "./reconnect-policy.js"

describe("shouldRetryReconnect", () => {
  it("retries on early attempts", () => {
    expect(shouldRetryReconnect(0)).toBe(true)
    expect(shouldRetryReconnect(1)).toBe(true)
    expect(shouldRetryReconnect(MAX_RECONNECT_ATTEMPTS - 1)).toBe(true)
  })

  it("stops at the cap", () => {
    expect(shouldRetryReconnect(MAX_RECONNECT_ATTEMPTS)).toBe(false)
    expect(shouldRetryReconnect(MAX_RECONNECT_ATTEMPTS + 5)).toBe(false)
  })

  it("the cap is a finite, sane number", () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(2)
    expect(MAX_RECONNECT_ATTEMPTS).toBeLessThan(100)
  })
})
