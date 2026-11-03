import { describe, it, expect } from "vitest"
import { STATUS_CREDITS, recipientCapFor, lagosDayBounds, postProgress } from "./status-post"

describe("status post rules", () => {
  it("prices posts like sent messages", () => {
    expect(STATUS_CREDITS).toEqual({ text: 5, image: 8, video: 12 })
  })

  it("caps recipients by plan with a basic fallback", () => {
    expect(recipientCapFor("pro")).toBe(10000)
    expect(recipientCapFor(undefined)).toBe(2000)
  })

  it("splits days at Lagos midnight, not UTC midnight", () => {
    // 23:30 UTC on 1 Nov is 00:30 on 2 Nov in Lagos.
    const { start, end } = lagosDayBounds(new Date("2026-11-01T23:30:00Z"))
    expect(start.toISOString()).toBe("2026-11-01T23:00:00.000Z")
    expect(end.toISOString()).toBe("2026-11-02T23:00:00.000Z")

    const midday = lagosDayBounds(new Date("2026-11-01T11:00:00Z"))
    expect(midday.start.toISOString()).toBe("2026-10-31T23:00:00.000Z")
  })
})

describe("postProgress", () => {
  const at = Date.parse("2026-11-03T12:00:00Z")
  const post = (status: string, offsetMs: number) => ({ status, scheduledAt: new Date(at + offsetMs).toISOString() })

  it("shows a post that's being worked on", () => {
    expect(postProgress(post("posting", -1000), at)).toBe("posting")
    expect(postProgress(post("scheduled", -1000), at)).toBe("waiting")
  })

  it("treats a post made just now as due, even if this clock runs behind the server's", () => {
    expect(postProgress(post("scheduled", 30_000), at)).toBe("waiting")
  })

  it("leaves out posts scheduled for later", () => {
    expect(postProgress(post("scheduled", 3_600_000), at)).toBeNull()
  })

  it("keeps a failure visible for a day", () => {
    expect(postProgress(post("failed", -3_600_000), at)).toBe("failed")
    expect(postProgress(post("failed", -25 * 3_600_000), at)).toBeNull()
  })

  it("ignores finished posts", () => {
    for (const status of ["posted", "cancelled", "deleted", "deleting"]) expect(postProgress(post(status, -1000), at)).toBeNull()
  })
})
