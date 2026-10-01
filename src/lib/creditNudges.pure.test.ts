import { describe, it, expect } from "vitest"
import { selectNudgeStage, repliesRemaining } from "./credit-nudges-job"

const periodStart = new Date("2026-10-01T00:00:00Z")
const base = {
  used: 0, limit: 1000, periodStart,
  halfNotifiedAt: null as Date | null,
  nearCapNotifiedAt: null as Date | null,
}

describe("selectNudgeStage", () => {
  it("stays quiet below half", () => {
    expect(selectNudgeStage({ ...base, used: 499 })).toBeNull()
  })

  it("fires the halfway nudge at 50%", () => {
    expect(selectNudgeStage({ ...base, used: 500 })).toBe("half")
  })

  it("fires near-cap at 90%", () => {
    expect(selectNudgeStage({ ...base, used: 900 })).toBe("near-cap")
  })

  it("prefers near-cap when an account crosses both between runs", () => {
    expect(selectNudgeStage({ ...base, used: 950 })).toBe("near-cap")
  })

  it("does not repeat a nudge already sent in this cycle", () => {
    const sent = new Date("2026-10-03T00:00:00Z")
    expect(selectNudgeStage({ ...base, used: 600, halfNotifiedAt: sent })).toBeNull()
    expect(selectNudgeStage({ ...base, used: 950, nearCapNotifiedAt: sent })).toBe("half")
  })

  it("re-arms when the stamp predates the current period — no reset job needed", () => {
    const lastCycle = new Date("2026-09-12T00:00:00Z")
    expect(selectNudgeStage({ ...base, used: 600, halfNotifiedAt: lastCycle })).toBe("half")
    expect(selectNudgeStage({ ...base, used: 950, nearCapNotifiedAt: lastCycle })).toBe("near-cap")
  })

  it("treats a stamp exactly at the period start as belonging to this cycle", () => {
    expect(selectNudgeStage({ ...base, used: 600, halfNotifiedAt: periodStart })).toBeNull()
  })

  it("stays quiet when the plan has no allowance to run out of", () => {
    expect(selectNudgeStage({ ...base, used: 9999, limit: 0 })).toBeNull()
    expect(selectNudgeStage({ ...base, used: 9999, limit: -1 })).toBeNull()
  })

  it("scales with the allowance rather than hardcoded credit counts", () => {
    expect(selectNudgeStage({ ...base, used: 1200, limit: 2000 })).toBe("half")
    expect(selectNudgeStage({ ...base, used: 1900, limit: 2000 })).toBe("near-cap")
  })
})

describe("repliesRemaining", () => {
  it("converts the remaining allowance into whole replies", () => {
    expect(repliesRemaining(900, 1000)).toBe(20) // 100 credits / 5 per text reply
    expect(repliesRemaining(998, 1000)).toBe(0)
  })
  it("never goes negative once the cap is passed", () => {
    expect(repliesRemaining(1300, 1000)).toBe(0)
  })
})
