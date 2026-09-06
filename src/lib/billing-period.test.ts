import { describe, it, expect, vi, afterEach } from "vitest"
import { getBillingPeriod } from "./billing-period"

const DAY = 24 * 60 * 60 * 1000

describe("getBillingPeriod", () => {
  afterEach(() => vi.useRealTimers())

  it("uses [currentPeriodStart, expiry] for an active anchored cycle", () => {
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z")) // inside the cycle
    const start = new Date("2026-08-24T17:00:00Z")
    const expiry = new Date("2026-09-24T17:00:00Z")
    const p = getBillingPeriod(expiry, start)
    expect(p.start.toISOString()).toBe(start.toISOString())
    expect(p.end.toISOString()).toBe(expiry.toISOString())
  })

  it("excludes the previous cycle after a lapsed resubscribe (regression)", () => {
    // Resubscribed today: nextExpiry = addOneMonth(now) lands 31 days out (Aug→Sep).
    vi.setSystemTime(new Date("2026-08-24T17:00:00Z"))
    const now = new Date("2026-08-24T17:00:00Z")
    const expiry = new Date("2026-09-24T17:00:00Z")
    const priorUsage = new Date("2026-08-10T12:00:00Z") // spent in the OLD cycle

    // Legacy inference: the 31-day-out expiry walks back a full 30-day step, so
    // the window starts ~29 days ago and still contains the previous cycle.
    const legacy = getBillingPeriod(expiry)
    expect(priorUsage >= legacy.start && priorUsage < legacy.end).toBe(true)

    // With the anchor stamped at resubscribe the window starts now — prior usage
    // falls outside, so "used this cycle" correctly resets to 0.
    const fixed = getBillingPeriod(expiry, now)
    expect(fixed.start.toISOString()).toBe(now.toISOString())
    expect(priorUsage < fixed.start).toBe(true)
  })

  it("falls back to a rolling 30-day window when there is no anchor or expiry", () => {
    vi.setSystemTime(new Date("2026-08-24T00:00:00Z"))
    const p = getBillingPeriod(null)
    expect(p.end.getTime() - p.start.getTime()).toBe(30 * DAY)
    expect(p.end.toISOString()).toBe("2026-08-24T00:00:00.000Z")
  })

  it("derives end = anchor + 30d when expiry is missing (active)", () => {
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z")) // inside [start, start+30d]
    const start = new Date("2026-08-24T00:00:00Z")
    const p = getBillingPeriod(null, start)
    expect(p.start.toISOString()).toBe(start.toISOString())
    expect(p.end.getTime() - p.start.getTime()).toBe(30 * DAY)
  })

  // --- the lapsed-window leak fix: a window that ended before `now` must roll
  // forward to contain `now`, otherwise current usage escapes the cap entirely. ---

  it("rolls a lapsed expiry-only window FORWARD to contain now (leak fix)", () => {
    // Subscription expired Aug 18; today is Sep 6. Before the fix the window
    // stayed at [Jul 19, Aug 18], so all September usage fell outside it and
    // never counted against the free cap.
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"))
    const expiry = new Date("2026-08-18T21:00:00Z")
    const p = getBillingPeriod(expiry)
    const now = Date.now()
    expect(p.end.getTime() - p.start.getTime()).toBe(30 * DAY)
    // A charge made "now" must land inside the window so it is counted.
    expect(now >= p.start.getTime() && now < p.end.getTime()).toBe(true)
  })

  it("rolls a lapsed anchored window FORWARD in whole cycles (leak fix)", () => {
    vi.setSystemTime(new Date("2026-09-06T12:00:00Z"))
    const start = new Date("2026-07-18T00:00:00Z")
    const expiry = new Date("2026-08-18T00:00:00Z") // lapsed ~31-day cycle, never re-anchored
    const p = getBillingPeriod(expiry, start)
    const now = Date.now()
    expect(now >= p.start.getTime() && now < p.end.getTime()).toBe(true)
  })

  it("still walks a far-future expiry BACK to the cycle containing now", () => {
    vi.setSystemTime(new Date("2026-09-06T00:00:00Z"))
    const expiry = new Date("2026-12-01T00:00:00Z")
    const p = getBillingPeriod(expiry)
    const now = Date.now()
    expect(p.end.getTime() - p.start.getTime()).toBe(30 * DAY)
    expect(now >= p.start.getTime() && now < p.end.getTime()).toBe(true)
  })
})
