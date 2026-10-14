import { describe, it, expect } from "vitest"
import { withinSendWindow, capPerAgent, buildFollowUpInstruction, hourInLagos } from "./auto-followup-rules.js"

describe("withinSendWindow", () => {
  it("allows daytime hours", () => {
    expect(withinSendWindow(9)).toBe(true)
    expect(withinSendWindow(14)).toBe(true)
    expect(withinSendWindow(20)).toBe(true)
  })

  it("blocks evening and early morning", () => {
    expect(withinSendWindow(21)).toBe(false)
    expect(withinSendWindow(23)).toBe(false)
    expect(withinSendWindow(0)).toBe(false)
    expect(withinSendWindow(6)).toBe(false)
    expect(withinSendWindow(8)).toBe(false)
  })
})

describe("hourInLagos", () => {
  it("converts UTC to Lagos time (UTC+1, no DST)", () => {
    expect(hourInLagos(new Date("2026-10-14T08:30:00Z"))).toBe(9)
    expect(hourInLagos(new Date("2026-10-14T23:10:00Z"))).toBe(0)
  })
})

describe("capPerAgent", () => {
  it("caps rows per agent while preserving order", () => {
    const rows = [
      { agentId: "a", id: 1 },
      { agentId: "a", id: 2 },
      { agentId: "b", id: 3 },
      { agentId: "a", id: 4 },
      { agentId: "b", id: 5 },
    ]
    expect(capPerAgent(rows, 2)).toEqual([
      { agentId: "a", id: 1 },
      { agentId: "a", id: 2 },
      { agentId: "b", id: 3 },
      { agentId: "b", id: 5 },
    ])
  })

  it("returns everything when under the cap", () => {
    const rows = [{ agentId: "a" }, { agentId: "b" }]
    expect(capPerAgent(rows, 5)).toEqual(rows)
  })
})

describe("buildFollowUpInstruction", () => {
  it("states the silence duration, rounded to whole hours", () => {
    expect(buildFollowUpInstruction(2.4, null)).toContain("about 2 hours")
    expect(buildFollowUpInstruction(0.9, null)).toContain("about 1 hour.")
  })

  it("never reports less than one hour", () => {
    expect(buildFollowUpInstruction(0.1, null)).toContain("about 1 hour")
  })

  it("includes owner guidance only when present", () => {
    expect(buildFollowUpInstruction(3, "Mention free Lagos delivery")).toContain("Mention free Lagos delivery")
    expect(buildFollowUpInstruction(3, "   ")).not.toContain("Owner guidance")
    expect(buildFollowUpInstruction(3, null)).not.toContain("Owner guidance")
  })
})
