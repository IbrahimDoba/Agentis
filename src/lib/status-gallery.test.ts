import { describe, it, expect } from "vitest"
import { statusContentKey } from "./status-gallery"

describe("statusContentKey", () => {
  it("keys media posts by library file, whatever the caption", () => {
    expect(statusContentKey({ kind: "image", mediaItemId: "m1", text: "New stock" })).toBe("media:m1")
    expect(statusContentKey({ kind: "video", mediaItemId: "m1", text: null })).toBe("media:m1")
  })

  it("keys text posts by text and background together", () => {
    const a = statusContentKey({ kind: "text", text: "Open Sunday", backgroundColor: "#0b3d2e" })
    expect(a).toBe(statusContentKey({ kind: "text", text: "Open Sunday", backgroundColor: "#0b3d2e" }))
    expect(a).not.toBe(statusContentKey({ kind: "text", text: "Open Sunday", backgroundColor: "#1f2937" }))
    expect(a).not.toBe(statusContentKey({ kind: "text", text: "Open Monday", backgroundColor: "#0b3d2e" }))
  })

  it("matches the migration's SQL backfill", () => {
    // SELECT encode(sha256(convert_to('#0b3d2e' || E'\n' || 'Open Sunday', 'UTF8')), 'hex')
    expect(statusContentKey({ kind: "text", text: "Open Sunday", backgroundColor: "#0b3d2e" }))
      .toBe("text:7cab691815f82751453dfa613c121a0ced4f392d9c2b50d0b223107012cdc542")
  })
})
