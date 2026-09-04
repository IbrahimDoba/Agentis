import { describe, it, expect } from "vitest"
import { bodySchema } from "./route"

// The request contract for Surface C. These rules are what a developer hits
// first, so they are pinned here rather than discovered at runtime.
const base = { agentId: "a1", to: "2348012345678" }
const ok = (b: unknown) => bodySchema.safeParse(b).success
const why = (b: unknown) => {
  const r = bodySchema.safeParse(b)
  return r.success ? null : r.error.issues[0]?.message
}

describe("POST /v1/messages body", () => {
  it("still accepts the text-only call that existed before media", () => {
    // Backwards compatibility: every integration today sends exactly this.
    expect(ok({ ...base, text: "hello" })).toBe(true)
    expect(ok({ ...base, text: "hello", type: "text" })).toBe(true)
  })

  it("rejects a call with neither text nor media", () => {
    expect(why(base)).toMatch(/text is required/)
  })

  it("accepts an image or video by URL, with or without a caption", () => {
    expect(ok({ ...base, type: "image", mediaUrl: "https://cdn.example.com/a.jpg" })).toBe(true)
    expect(ok({ ...base, type: "video", mediaUrl: "https://cdn.example.com/a.mp4", text: "demo" })).toBe(true)
  })

  it("requires a filename for documents, because WhatsApp shows it", () => {
    const doc = { ...base, type: "document", mediaUrl: "https://cdn.example.com/p.pdf" }
    expect(why(doc)).toMatch(/fileName is required/)
    expect(ok({ ...doc, fileName: "price-list.pdf" })).toBe(true)
  })

  it("rejects a media type with no mediaUrl", () => {
    expect(why({ ...base, type: "video" })).toMatch(/mediaUrl is required/)
  })

  it("rejects a mediaUrl with no media type, rather than guessing", () => {
    expect(why({ ...base, mediaUrl: "https://cdn.example.com/a.jpg" })).toMatch(/type must be one of/)
    expect(why({ ...base, mediaUrl: "https://cdn.example.com/a.jpg", type: "text" })).toMatch(/type must be one of/)
  })

  it("rejects a mediaUrl that is not a URL", () => {
    expect(ok({ ...base, type: "image", mediaUrl: "not-a-url" })).toBe(false)
  })

  it("keeps the existing text length cap", () => {
    expect(ok({ ...base, text: "x".repeat(4096) })).toBe(true)
    expect(ok({ ...base, text: "x".repeat(4097) })).toBe(false)
  })
})
