import { describe, it, expect } from "vitest"
import { normalizeNameTag, previewSavedName } from "./contact-name-tag"

describe("normalizeNameTag", () => {
  it("accepts the owner's own short tag as-is", () => {
    expect(normalizeNameTag("- Shop")).toEqual({ ok: true, tag: "- Shop" })
    expect(normalizeNameTag("· Customer")).toEqual({ ok: true, tag: "· Customer" })
  })

  it("treats empty as no tag", () => {
    expect(normalizeNameTag("")).toEqual({ ok: true, tag: null })
    expect(normalizeNameTag("   ")).toEqual({ ok: true, tag: null })
    expect(normalizeNameTag(null)).toEqual({ ok: true, tag: null })
  })

  it("trims and collapses spaces", () => {
    expect(normalizeNameTag("  (VIP)   Lagos ")).toEqual({ ok: true, tag: "(VIP) Lagos" })
  })

  it("rejects long or odd tags", () => {
    expect(normalizeNameTag("x".repeat(13)).ok).toBe(false)
    expect(normalizeNameTag("🔥🔥").ok).toBe(false)
    expect(normalizeNameTag("<b>").ok).toBe(false)
  })
})

describe("previewSavedName", () => {
  it("shows the name the owner will see in their phone", () => {
    expect(previewSavedName("Ada Obi", "- Shop")).toBe("Ada Obi - Shop")
    expect(previewSavedName("Ada Obi", null)).toBe("Ada Obi")
  })
})
