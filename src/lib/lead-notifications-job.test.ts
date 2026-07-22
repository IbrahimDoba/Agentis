import { describe, it, expect } from "vitest"
import { digestWindowStart, displayWho } from "./lead-notifications-job"

describe("digestWindowStart", () => {
  const now = new Date("2026-07-22T12:00:00.000Z")

  it("goes back 24h for a daily window", () => {
    expect(digestWindowStart("day", now).toISOString()).toBe("2026-07-21T12:00:00.000Z")
  })

  it("goes back 7 days for a weekly window", () => {
    expect(digestWindowStart("week", now).toISOString()).toBe("2026-07-15T12:00:00.000Z")
  })
})

describe("displayWho", () => {
  it("prefers the saved name", () => {
    expect(displayWho("Kiekie", "0808 000 0000")).toBe("Kiekie")
  })

  it("falls back to the number when there's no name", () => {
    expect(displayWho(null, "0808 000 0000")).toBe("0808 000 0000")
    expect(displayWho("   ", "0808 000 0000")).toBe("0808 000 0000")
  })

  it("uses a neutral label when neither is present", () => {
    expect(displayWho(null, null)).toBe("A customer")
    expect(displayWho("", "")).toBe("A customer")
    expect(displayWho(undefined, undefined)).toBe("A customer")
  })
})
