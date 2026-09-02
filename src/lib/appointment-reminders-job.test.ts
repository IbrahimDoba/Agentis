import { describe, it, expect } from "vitest"
import { dueStages, leadLabel, sameNumber, dayPhrase, type ReminderRow } from "./appointment-reminders-job"
import { normalizePhone } from "./phone"

const base = (over: Partial<ReminderRow>): ReminderRow => ({
  scheduledAt: new Date("2026-08-04T12:00:00.000Z"),
  reminder1Minutes: 60,
  reminder1SentAt: null,
  reminder2Minutes: 15,
  reminder2SentAt: null,
  ...over,
})

describe("dueStages", () => {
  const sched = new Date("2026-08-04T12:00:00.000Z")
  const at = (minsBefore: number) => new Date(sched.getTime() - minsBefore * 60_000)

  it("fires nothing while both lead times are still ahead", () => {
    // 90 min before → r1(60) triggers at 60-before, r2(15) at 15-before; neither reached.
    expect(dueStages(base({}), at(90))).toEqual([])
  })

  it("fires reminder 1 once its lead time arrives", () => {
    expect(dueStages(base({}), at(50))).toEqual([{ stage: 1, minutes: 60 }])
  })

  it("fires reminder 2 when 1 is already sent", () => {
    const r = base({ reminder1SentAt: new Date() })
    expect(dueStages(r, at(10))).toEqual([{ stage: 2, minutes: 15 }])
  })

  it("can fire both stages in one pass", () => {
    expect(dueStages(base({}), at(5))).toEqual([
      { stage: 1, minutes: 60 },
      { stage: 2, minutes: 15 },
    ])
  })

  it("never fires once the appointment has started", () => {
    expect(dueStages(base({}), new Date(sched.getTime() + 1))).toEqual([])
  })

  it("skips reminder 2 when it is disabled (null)", () => {
    const r = base({ reminder1SentAt: new Date(), reminder2Minutes: null })
    expect(dueStages(r, at(10))).toEqual([])
  })

  it("does not re-fire a stage already sent", () => {
    const r = base({ reminder1SentAt: new Date(), reminder2SentAt: new Date() })
    expect(dueStages(r, at(1))).toEqual([])
  })
})

describe("normalizePhone", () => {
  it("strips the formatting a dashboard-typed number carries", () => {
    // The worker appends "@s.whatsapp.net" to a non-JID `to` verbatim, so
    // anything but digits here produces a JID that can never deliver.
    expect(normalizePhone("+234 802 792 9743")).toBe("2348027929743")
    expect(normalizePhone("234-803-123-4567")).toBe("2348031234567")
    expect(normalizePhone(" 2348031234567 ")).toBe("2348031234567")
  })
  it("returns empty for nothing addressable", () => {
    expect(normalizePhone(null)).toBe("")
    expect(normalizePhone(undefined)).toBe("")
    expect(normalizePhone("n/a")).toBe("")
  })
  it("keys the same customer to one conversation regardless of how it was typed", () => {
    expect(normalizePhone("+234 802 792 9743")).toBe(normalizePhone("2348027929743"))
  })
})

describe("sameNumber", () => {
  it("matches the same line across formatting differences", () => {
    expect(sameNumber("+234 803 123 4567", "2348031234567")).toBe(true)
    expect(sameNumber("08031234567", "2348031234567")).toBe(true) // local vs country-code
    expect(sameNumber("234-803-123-4567", "+2348031234567")).toBe(true)
  })
  it("does not match different numbers", () => {
    expect(sameNumber("2348031234567", "2348039999999")).toBe(false)
  })
  it("is false when either side is missing", () => {
    expect(sameNumber(null, "2348031234567")).toBe(false)
    expect(sameNumber("2348031234567", undefined)).toBe(false)
    expect(sameNumber("", "")).toBe(false)
  })
})

describe("leadLabel", () => {
  it("phrases minutes, hours and days", () => {
    expect(leadLabel(1)).toBe("in 1 minute")
    expect(leadLabel(15)).toBe("in 15 minutes")
    expect(leadLabel(60)).toBe("in about 1 hour")
    expect(leadLabel(120)).toBe("in about 2 hours")
    expect(leadLabel(1440)).toBe("in about 1 day")
    expect(leadLabel(2880)).toBe("in about 2 days")
  })
})

describe("dayPhrase", () => {
  // now = Wed 2 Sep 2026, 09:00 WAT (Africa/Lagos = UTC+1).
  const now = new Date("2026-09-02T08:00:00.000Z")

  it("says 'today' for a same Lagos-day appointment", () => {
    expect(dayPhrase(new Date("2026-09-02T18:00:00.000Z"), now)).toBe("today")
  })

  it("says 'tomorrow' for the next day", () => {
    expect(dayPhrase(new Date("2026-09-03T09:00:00.000Z"), now)).toBe("tomorrow")
  })

  it("gives an absolute date further out — and never a clock time", () => {
    const p = dayPhrase(new Date("2026-09-06T09:00:00.000Z"), now)
    expect(p.startsWith("on ")).toBe(true)
    expect(p).toContain("Sep 6")
    expect(p).not.toMatch(/\d:\d/) // no HH:MM — the whole point is no time to garble
  })
})
