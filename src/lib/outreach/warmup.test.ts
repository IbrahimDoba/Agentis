import { describe, it, expect } from "vitest"
import { warmupStage, warmupDay, parseWarmupStart, WARMUP_DAYS } from "./warmup"

const START = new Date("2026-09-01T00:00:00Z")
const dayN = (n: number) => new Date(START.getTime() + (n - 1) * 86_400_000)

describe("warmupDay", () => {
  it("counts the start day as day 1", () => {
    expect(warmupDay(START, START)).toBe(1)
    expect(warmupDay(START, new Date("2026-09-01T23:59:00Z"))).toBe(1)
    expect(warmupDay(START, dayN(2))).toBe(2)
  })
})

describe("warmupStage", () => {
  it("ramps through the schedule", () => {
    expect(warmupStage(START, 30, dayN(1)).cap).toBe(5)
    expect(warmupStage(START, 30, dayN(3)).cap).toBe(5)
    expect(warmupStage(START, 30, dayN(4)).cap).toBe(10)
    expect(warmupStage(START, 30, dayN(7)).cap).toBe(10)
    expect(warmupStage(START, 30, dayN(8)).cap).toBe(15)
    expect(warmupStage(START, 30, dayN(14)).cap).toBe(15)
    expect(warmupStage(START, 30, dayN(15)).cap).toBe(25)
    expect(warmupStage(START, 30, dayN(21)).cap).toBe(25)
  })

  it("hands control back to the configured cap once complete", () => {
    const stage = warmupStage(START, 30, dayN(WARMUP_DAYS + 1))
    expect(stage.complete).toBe(true)
    expect(stage.cap).toBe(30)
  })

  it("never exceeds the configured cap, even mid-ramp", () => {
    expect(warmupStage(START, 3, dayN(20)).cap).toBe(3)
    expect(warmupStage(START, 3, dayN(60)).cap).toBe(3)
  })

  it("treats a missing start date as day one, not as finished", () => {
    const stage = warmupStage(null, 30)
    expect(stage.complete).toBe(false)
    expect(stage.cap).toBe(5)
  })

  it("treats a future start date as day one rather than a negative day", () => {
    const stage = warmupStage(START, 30, new Date("2026-08-01T00:00:00Z"))
    expect(stage.day).toBe(1)
    expect(stage.cap).toBe(5)
  })
})

describe("parseWarmupStart", () => {
  it("accepts a plain date", () => {
    expect(parseWarmupStart("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z")
  })

  it("returns null for missing or unparseable values", () => {
    expect(parseWarmupStart(undefined)).toBeNull()
    expect(parseWarmupStart("not a date")).toBeNull()
  })
})

describe("warmup can be switched off", () => {
  it("applies the full cap when the ramp is disabled", async () => {
    const { effectiveDailyCap, warmupStatus } = await import("./send")
    const base = {
      dailyCap: 100, hourlyCap: 10, sliceSize: 10,
      warmupStartedAt: START, whatsappNumber: null, fromName: "Dailzero",
      signerName: "x", signerTitle: "y", htmlEnabled: true, logoUrl: null,
      sendingEnabled: true,
    }
    // On day 1 the ramp would hold this at 5.
    expect(effectiveDailyCap({ ...base, warmupEnabled: true }, START)).toBe(5)
    expect(effectiveDailyCap({ ...base, warmupEnabled: false }, START)).toBe(100)

    const off = warmupStatus({ ...base, warmupEnabled: false }, START)
    expect(off.enabled).toBe(false)
    expect(off.complete).toBe(true)
    expect(off.cap).toBe(100)
  })
})
