import { describe, it, expect } from "vitest"
import { buildAppointmentInvite, icsDate, icsEscape, icsFold } from "./calendar-invite"

const base = {
  uid: "appt-abc@dailzero.com",
  start: new Date("2026-10-08T13:00:00Z"),
  durationMinutes: 30,
  summary: "Dailzero consultation meeting",
  organizerEmail: "noreply@dailzero.com",
  organizerName: "D-Zero AI",
  attendeeEmail: "owner@example.com",
  attendeeName: "Owner",
  now: new Date("2026-10-07T10:00:00Z"),
}

describe("icsDate", () => {
  it("formats UTC basic time", () => {
    expect(icsDate(new Date("2026-10-08T13:05:09.123Z"))).toBe("20261008T130509Z")
  })
})

describe("icsEscape", () => {
  it("escapes the RFC 5545 TEXT specials", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne")
  })
})

describe("icsFold", () => {
  it("leaves short lines alone", () => {
    expect(icsFold("SUMMARY:short")).toBe("SUMMARY:short")
  })
  it("folds long lines into ≤75-octet segments", () => {
    const folded = icsFold("DESCRIPTION:" + "x".repeat(200))
    const enc = new TextEncoder()
    for (const seg of folded.split("\r\n")) expect(enc.encode(seg).length).toBeLessThanOrEqual(75)
    expect(folded.split("\r\n").slice(1).every((s) => s.startsWith(" "))).toBe(true)
    expect(folded.replace(/\r\n /g, "")).toBe("DESCRIPTION:" + "x".repeat(200))
  })
  it("never splits a multi-byte character", () => {
    const folded = icsFold("SUMMARY:" + "₦".repeat(60))
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "₦".repeat(60))
  })
})

describe("buildAppointmentInvite", () => {
  const ics = buildAppointmentInvite({ ...base, description: "Customer: Ada, +234801\nNotes: wants pricing" })

  it("is a REQUEST invite with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(ics).toContain("METHOD:REQUEST\r\n")
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
  })
  it("sets start, a computed end, and a stable uid", () => {
    expect(ics).toContain("DTSTART:20261008T130000Z")
    expect(ics).toContain("DTEND:20261008T133000Z")
    expect(ics).toContain("UID:appt-abc@dailzero.com")
  })
  it("addresses the attendee and escapes the description", () => {
    // Long lines are folded, so compare against the unfolded text.
    const unfolded = ics.replace(/\r\n /g, "")
    expect(unfolded).toContain("mailto:owner@example.com")
    expect(unfolded).toContain("DESCRIPTION:Customer: Ada\\, +234801\\nNotes: wants pricing")
  })
  it("omits DESCRIPTION when there is none", () => {
    const bare = buildAppointmentInvite(base)
    expect(bare.split("\r\n").filter((l) => l.startsWith("DESCRIPTION:"))).toHaveLength(1) // only the alarm's
  })
})
