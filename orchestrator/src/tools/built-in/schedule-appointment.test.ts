import { describe, it, expect } from "vitest"
import { parseScheduledAt } from "./schedule-appointment.js"

describe("parseScheduledAt", () => {
  const now = new Date("2026-08-04T09:00:00.000Z") // 10:00 WAT

  it("accepts a full ISO string with offset", () => {
    const r = parseScheduledAt("2026-08-06T14:00:00+01:00", now)
    expect(r?.at.toISOString()).toBe("2026-08-06T13:00:00.000Z")
  })

  it("accepts a trailing-Z UTC string", () => {
    const r = parseScheduledAt("2026-08-06T13:00:00Z", now)
    expect(r?.at.toISOString()).toBe("2026-08-06T13:00:00.000Z")
  })

  it("assumes WAT (+01:00) when no offset is given", () => {
    // 14:00 with no offset → interpreted as 14:00 WAT → 13:00 UTC.
    const r = parseScheduledAt("2026-08-06T14:00", now)
    expect(r?.at.toISOString()).toBe("2026-08-06T13:00:00.000Z")
  })

  it("rejects an unparseable string", () => {
    expect(parseScheduledAt("next tuesday afternoon", now)).toBeNull()
    expect(parseScheduledAt("", now)).toBeNull()
  })

  it("rejects a time in the past", () => {
    expect(parseScheduledAt("2026-08-04T08:00:00+01:00", now)).toBeNull()
  })

  it("returns a human label", () => {
    const r = parseScheduledAt("2026-08-06T14:00:00+01:00", now)
    expect(typeof r?.label).toBe("string")
    expect(r?.label).toContain("2026")
  })
})
