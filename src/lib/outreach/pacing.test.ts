import { describe, it, expect } from "vitest"
import { allowedNow, nextGapMs, MIN_GAP_MS, MAX_GAP_MS } from "./pacing"

describe("allowedNow", () => {
  const base = { sentToday: 0, sentLastHour: 0, dailyCap: 10, hourlyCap: 5, sliceSize: 3 }

  it("releases a slice when there is room everywhere", () => {
    expect(allowedNow(base)).toBe(3)
  })

  it("is limited by the slice, not by the headroom", () => {
    expect(allowedNow({ ...base, dailyCap: 100, hourlyCap: 100 })).toBe(3)
  })

  it("respects the hourly ceiling", () => {
    expect(allowedNow({ ...base, sentLastHour: 4 })).toBe(1)
    expect(allowedNow({ ...base, sentLastHour: 5 })).toBe(0)
  })

  it("respects the daily ceiling", () => {
    expect(allowedNow({ ...base, sentToday: 9 })).toBe(1)
    expect(allowedNow({ ...base, sentToday: 10 })).toBe(0)
  })

  it("takes the tightest ceiling when several bind at once", () => {
    expect(allowedNow({ ...base, sentToday: 9, sentLastHour: 4, sliceSize: 3 })).toBe(1)
  })

  it("never returns a negative allowance when a cap was lowered mid-day", () => {
    expect(allowedNow({ ...base, sentToday: 40, sentLastHour: 20 })).toBe(0)
  })
})

describe("nextGapMs", () => {
  it("always lands inside the window", () => {
    for (let i = 0; i < 2000; i++) {
      const gap = nextGapMs()
      expect(gap).toBeGreaterThanOrEqual(MIN_GAP_MS)
      expect(gap).toBeLessThanOrEqual(MAX_GAP_MS)
    }
  })

  it("varies rather than returning a constant interval", () => {
    const seen = new Set(Array.from({ length: 50 }, () => nextGapMs()))
    expect(seen.size).toBeGreaterThan(20)
  })

  it("centres near the middle of the window", () => {
    const samples = Array.from({ length: 3000 }, () => nextGapMs())
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const expected = (MIN_GAP_MS + MAX_GAP_MS) / 2
    expect(Math.abs(mean - expected)).toBeLessThan(5_000)
  })

  it("falls back to the mean rather than looping when sampling keeps missing", () => {
    // A generator pinned at an extreme drives every draw outside the window,
    // exercising the rejection-sampling escape hatch.
    const gap = nextGapMs(() => Number.EPSILON)
    expect(gap).toBeGreaterThanOrEqual(MIN_GAP_MS)
    expect(gap).toBeLessThanOrEqual(MAX_GAP_MS)
  })
})
