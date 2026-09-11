import { describe, it, expect } from "vitest"
import { olderThanWindow, needsRefresh, formatTranscript } from "./conversation-memory-window.js"

describe("olderThanWindow", () => {
  it("is zero while the whole thread still fits in the window", () => {
    expect(olderThanWindow(12, 40)).toBe(0)
    expect(olderThanWindow(40, 40)).toBe(0)
  })
  it("counts only what the model can no longer see", () => {
    expect(olderThanWindow(58, 40)).toBe(18)
  })
})

describe("needsRefresh", () => {
  it("does not fire when nothing has aged out", () => {
    expect(needsRefresh(0, 0, 8)).toBe(false)
  })
  it("waits until enough new history has aged out", () => {
    expect(needsRefresh(5, 0, 8)).toBe(false)
    expect(needsRefresh(8, 0, 8)).toBe(true)
  })
  it("measures against what the record already covers, not the total", () => {
    expect(needsRefresh(20, 18, 8)).toBe(false)
    expect(needsRefresh(30, 18, 8)).toBe(true)
  })
})

describe("formatTranscript", () => {
  it("distinguishes the operator from the agent", () => {
    const out = formatTranscript([
      { direction: "inbound", senderRole: "ai", content: "how much" },
      { direction: "outbound", senderRole: "ai", content: "around 30k" },
      { direction: "outbound", senderRole: "human", content: "It's 70k" },
    ])
    expect(out).toBe("Customer: how much\nBusiness (agent): around 30k\nBusiness (human): It's 70k")
  })
})
