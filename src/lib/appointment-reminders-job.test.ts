import { describe, it, expect } from "vitest"
import { dueStages, leadLabel, type ReminderRow } from "./appointment-reminders-job"

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
