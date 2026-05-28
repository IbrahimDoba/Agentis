import { describe, it, expect } from "vitest"
import { shouldSkipSessionStatusWrite } from "./queries.js"

describe("shouldSkipSessionStatusWrite", () => {
  const base = {
    status: "CONNECTED" as const,
    lastDisconnectReason: null,
    phoneNumber: "234801",
    warmupTier: 1,
    warmupStartedAt: null,
  }

  it("writes the very first time (no previous record)", () => {
    expect(shouldSkipSessionStatusWrite(undefined, { status: "QR_PENDING" })).toBe(false)
  })

  it("writes when the status changes", () => {
    expect(shouldSkipSessionStatusWrite(base, { status: "DISCONNECTED" })).toBe(false)
  })

  it("skips a duplicate write — same status, no extra", () => {
    expect(shouldSkipSessionStatusWrite(base, { status: "CONNECTED" })).toBe(true)
  })

  it("skips a duplicate DISCONNECTED with the same reason (the prod hot path)", () => {
    const prev = { ...base, status: "DISCONNECTED" as const, lastDisconnectReason: "timed_out" }
    expect(
      shouldSkipSessionStatusWrite(prev, {
        status: "DISCONNECTED",
        extra: { lastDisconnectReason: "timed_out" },
      })
    ).toBe(true)
  })

  it("writes when lastDisconnectReason changes (same DISCONNECTED status)", () => {
    const prev = { ...base, status: "DISCONNECTED" as const, lastDisconnectReason: "timed_out" }
    expect(
      shouldSkipSessionStatusWrite(prev, {
        status: "DISCONNECTED",
        extra: { lastDisconnectReason: "loggedOut" },
      })
    ).toBe(false)
  })

  it("writes when a fresh lastConnectedAt is recorded, even if status matches", () => {
    expect(
      shouldSkipSessionStatusWrite(base, {
        status: "CONNECTED",
        extra: { lastConnectedAt: new Date().toISOString() },
      })
    ).toBe(false)
  })

  it("writes when phoneNumber/warmupTier change", () => {
    expect(
      shouldSkipSessionStatusWrite(base, { status: "CONNECTED", extra: { phoneNumber: "234802" } })
    ).toBe(false)
    expect(
      shouldSkipSessionStatusWrite(base, { status: "CONNECTED", extra: { warmupTier: 2 } })
    ).toBe(false)
  })

  it("does NOT trigger a write when extra values match previous", () => {
    expect(
      shouldSkipSessionStatusWrite(base, {
        status: "CONNECTED",
        extra: { phoneNumber: base.phoneNumber!, warmupTier: base.warmupTier! },
      })
    ).toBe(true)
  })
})
