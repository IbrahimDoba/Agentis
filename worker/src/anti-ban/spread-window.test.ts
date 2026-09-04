import { describe, expect, it } from "vitest"
import { SMALL_LIST_MAX_RECIPIENTS, minSpreadHours, resolveSpreadHours, deferPastQuietHours } from "./spread-window.js"

describe("minSpreadHours", () => {
  it("allows no floor at or below the small-list threshold", () => {
    expect(minSpreadHours(1)).toBe(0)
    expect(minSpreadHours(SMALL_LIST_MAX_RECIPIENTS)).toBe(0)
  })

  it("keeps the 24h floor above the threshold", () => {
    expect(minSpreadHours(SMALL_LIST_MAX_RECIPIENTS + 1)).toBe(24)
    expect(minSpreadHours(2000)).toBe(24)
  })
})

describe("resolveSpreadHours", () => {
  it("defaults to 24h when nothing is requested, whatever the list size", () => {
    expect(resolveSpreadHours(2, null)).toBe(24)
    expect(resolveSpreadHours(2, undefined)).toBe(24)
    expect(resolveSpreadHours(500, null)).toBe(24)
  })

  it("honours 0 for a small list so pacing falls back to the anti-ban gap", () => {
    expect(resolveSpreadHours(2, 0)).toBe(0)
    expect(resolveSpreadHours(SMALL_LIST_MAX_RECIPIENTS, 0)).toBe(0)
  })

  it("honours an intermediate sub-24h window for a small list", () => {
    expect(resolveSpreadHours(2, 1)).toBe(1)
    expect(resolveSpreadHours(2, 12)).toBe(12)
  })

  it("raises a sub-24h request back to the floor for a large list", () => {
    expect(resolveSpreadHours(SMALL_LIST_MAX_RECIPIENTS + 1, 0)).toBe(24)
    expect(resolveSpreadHours(500, 2)).toBe(24)
  })

  it("caps at 168h (7 days) regardless of list size", () => {
    expect(resolveSpreadHours(2, 1000)).toBe(168)
    expect(resolveSpreadHours(500, 169)).toBe(168)
  })

  // The bug this whole change fixes: 2 recipients over a forced 24h window gave
  // minSpacing = 12h, so even the FIRST message waited 12 hours.
  it("makes a 2-recipient send immediate-ish instead of 12h out", () => {
    const windowMs = resolveSpreadHours(2, 0) * 60 * 60 * 1000
    expect(Math.floor(windowMs / 2)).toBe(0) // anti-ban gap (8-20s) now dominates
    const oldWindowMs = 24 * 60 * 60 * 1000
    expect(Math.floor(oldWindowMs / 2)).toBe(43_200_000) // 12h, the old behaviour
  })
})

describe("deferPastQuietHours (Africa/Lagos = WAT = UTC+1)", () => {
  const tz = "Africa/Lagos"
  const at = (iso: string) => new Date(iso).getTime()
  const iso = (ms: number) => new Date(ms).toISOString()

  it("leaves a daytime send unchanged", () => {
    const t = at("2026-09-04T12:00:00.000Z") // 13:00 WAT
    expect(deferPastQuietHours(t, tz)).toBe(t)
  })

  it("pushes a late-night send (23:30 WAT) to the next morning 6am", () => {
    const t = at("2026-09-04T22:30:00.000Z") // 23:30 WAT, Sep 4
    expect(iso(deferPastQuietHours(t, tz))).toBe("2026-09-05T05:00:00.000Z") // 06:00 WAT, Sep 5
  })

  it("pushes an early-morning send (02:00 WAT) to 6am the same day", () => {
    const t = at("2026-09-04T01:00:00.000Z") // 02:00 WAT, Sep 4
    expect(iso(deferPastQuietHours(t, tz))).toBe("2026-09-04T05:00:00.000Z") // 06:00 WAT, Sep 4
  })

  it("treats 06:00 as daytime (unchanged) and 23:00 as quiet (deferred)", () => {
    const six = at("2026-09-04T05:00:00.000Z") // 06:00 WAT
    expect(deferPastQuietHours(six, tz)).toBe(six)
    const eleven = at("2026-09-04T22:00:00.000Z") // 23:00 WAT
    expect(iso(deferPastQuietHours(eleven, tz))).toBe("2026-09-05T05:00:00.000Z")
  })
})
