import { describe, it, expect } from "vitest"
import { statusCredits, recipientCapFor, statusJidList, transcodeArgs, statusReplyLabel } from "./status-post.js"

describe("statusCredits", () => {
  it("bills a post like one sent message of the same type", () => {
    expect(statusCredits("text")).toBe(5)
    expect(statusCredits("image")).toBe(8)
    expect(statusCredits("video")).toBe(12)
  })
})

describe("recipientCapFor", () => {
  it("caps by plan and falls back to basic for unknown plans", () => {
    expect(recipientCapFor("basic")).toBe(2000)
    expect(recipientCapFor("starter")).toBe(5000)
    expect(recipientCapFor("pro")).toBe(10000)
    expect(recipientCapFor("mystery")).toBe(2000)
    expect(recipientCapFor(null)).toBe(2000)
  })
})

describe("statusJidList", () => {
  it("puts the owner first and doesn't count them as a recipient", () => {
    const { jids, recipients } = statusJidList(["2348011111111", "2348022222222"], "2348163807158", 10)
    expect(jids).toEqual(["2348163807158@s.whatsapp.net", "2348011111111@s.whatsapp.net", "2348022222222@s.whatsapp.net"])
    expect(recipients).toBe(2)
  })

  it("drops the owner's own number, duplicates and non-phones", () => {
    const { jids, recipients } = statusJidList(["2348163807158", "2348011111111", "2348011111111", "12345", "120363@g.us"], "2348163807158", 10)
    expect(jids).toEqual(["2348163807158@s.whatsapp.net", "2348011111111@s.whatsapp.net"])
    expect(recipients).toBe(1)
  })

  it("stops at the plan cap", () => {
    const phones = Array.from({ length: 50 }, (_, i) => `23480${String(i).padStart(8, "0")}`)
    const { jids, recipients } = statusJidList(phones, null, 20)
    expect(recipients).toBe(20)
    expect(jids).toHaveLength(20)
  })
})

describe("transcodeArgs", () => {
  it("targets the profile that plays from a linked device", () => {
    const args = transcodeArgs("in.mp4", "out.mp4").join(" ")
    expect(args).toContain("-profile:v main -level 3.1")
    expect(args).toContain("-movflags +faststart")
    expect(args).toContain("-t 60")
    expect(args).toContain("-threads 1")
    expect(args.endsWith("out.mp4")).toBe(true)
  })
})

describe("statusReplyLabel", () => {
  it("names a captionless video so the AI knows what was replied to", () => {
    expect(statusReplyLabel({ videoMessage: {} }, null)).toBe("[Replying to your WhatsApp status: a video with no caption]")
  })

  it("quotes the caption or text", () => {
    expect(statusReplyLabel({ imageMessage: { caption: "New ankara sets " } }, null))
      .toBe('[Replying to your WhatsApp status (an image): "New ankara sets"]')
    expect(statusReplyLabel({ extendedTextMessage: { text: "Open Sunday" } }, null))
      .toBe('[Replying to your WhatsApp status (a text post): "Open Sunday"]')
  })

  it("adds the owner's note for the AI", () => {
    expect(statusReplyLabel({ videoMessage: {} }, " Red gown, ₦45,000, sizes 8-16 "))
      .toBe("[Replying to your WhatsApp status: a video with no caption]\n[What this status is about: Red gown, ₦45,000, sizes 8-16]")
    expect(statusReplyLabel({ videoMessage: {} }, "  ")).toBe("[Replying to your WhatsApp status: a video with no caption]")
  })
})
