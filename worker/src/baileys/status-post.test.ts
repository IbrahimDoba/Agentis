import { describe, it, expect } from "vitest"
import { statusCredits, recipientCapFor, statusJidList, transcodeArgs, statusReplyLabel, receiptEvents, statusLikeTarget } from "./status-post.js"

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
    expect(args).toContain("-maxrate 1800k")
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

describe("receiptEvents", () => {
  it("turns a delivery receipt into delivered", () => {
    expect(receiptEvents({ receiptTimestamp: 1_800_000_000 })).toEqual([{ kind: "delivered", at: new Date(1_800_000_000_000) }])
  })

  it("counts a read as delivered too", () => {
    const events = receiptEvents({ readTimestamp: 1_800_000_100 })
    expect(events.map((e) => e.kind)).toEqual(["delivered", "viewed"])
  })

  it("treats a played video as viewed and handles protobuf Longs", () => {
    const events = receiptEvents({ playedTimestamp: { toNumber: () => 1_800_000_200 } })
    expect(events.map((e) => e.kind)).toEqual(["delivered", "viewed"])
    expect(receiptEvents({})).toEqual([])
  })
})

describe("statusLikeTarget", () => {
  const like = (text: string, over: Record<string, unknown> = {}) => ({
    key: { remoteJid: "status@broadcast", fromMe: false, participant: "12345@lid", ...over },
    message: { reactionMessage: { text, key: { id: "3EB0STATUS" } } },
  })

  it("finds the liked status and the liker", () => {
    expect(statusLikeTarget(like("💚"))).toEqual({ statusId: "3EB0STATUS", likerJid: "12345@lid" })
  })

  it("ignores un-likes, our own reactions and other chats", () => {
    expect(statusLikeTarget(like(""))).toBeNull()
    expect(statusLikeTarget(like("💚", { fromMe: true }))).toBeNull()
    expect(statusLikeTarget(like("💚", { remoteJid: "2348011111111@s.whatsapp.net" }))).toBeNull()
  })
})
