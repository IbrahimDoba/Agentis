import { describe, it, expect } from "vitest"
import { chunkText, chunkStructuredText } from "./chunker.js"

describe("chunkText — unchanged behaviour", () => {
  // 1,867 live chunks came from this function and there is no re-index path,
  // so its output must not move.
  it("still collapses whitespace into one run", () => {
    expect(chunkText("a\n\nb   c\nd")).toEqual(["a b c d"])
  })

  it("still returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([])
    expect(chunkText("   \n  ")).toEqual([])
  })

  it("still overlaps long text by the configured 67 words", () => {
    const out = chunkText(Array.from({ length: 1200 }, (_, i) => `w${i}`).join(" "))
    expect(out.length).toBeGreaterThan(1)
    // Chunk 2 opens with chunk 1's final OVERLAP_WORDS, not its final few.
    expect(out[1].split(" ").slice(0, 67)).toEqual(out[0].split(" ").slice(-67))
  })
})

describe("chunkStructuredText", () => {
  const page = ["# Delivery", "We deliver across Lagos mainland.", "## Fees", "Ikeja costs two thousand naira."]

  it("stamps every chunk with the page title", () => {
    for (const c of chunkStructuredText(page, "Acme — Delivery")) {
      expect(c.startsWith("Acme — Delivery")).toBe(true)
    }
  })

  it("carries the nearest heading into the chunk", () => {
    const out = chunkStructuredText(page, "Acme")
    expect(out.join("\n")).toContain("Delivery")
  })

  it("keeps a small page as a single chunk", () => {
    expect(chunkStructuredText(page, "Acme")).toHaveLength(1)
  })

  it("returns nothing for empty input", () => {
    expect(chunkStructuredText([], "T")).toEqual([])
    expect(chunkStructuredText(["", "  "], "T")).toEqual([])
  })

  it("splits a long page into several chunks", () => {
    const blocks = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(30))
    const out = chunkStructuredText(blocks, "Long page")
    expect(out.length).toBeGreaterThan(1)
    for (const c of out) expect(c.startsWith("Long page")).toBe(true)
  })

  it("does not split a block that fits", () => {
    const para = "sentence one. " .repeat(40)
    const out = chunkStructuredText(["## H", para], "T")
    expect(out.some((c) => c.includes(para.trim()))).toBe(true)
  })

  it("splits a genuinely huge block at sentence boundaries", () => {
    const huge = Array.from({ length: 200 }, (_, i) => `This is sentence number ${i} in a very long paragraph.`).join(" ")
    const out = chunkStructuredText([huge], "T")
    expect(out.length).toBeGreaterThan(1)
    // No chunk ends mid-sentence.
    for (const c of out) expect(c.trim().endsWith(".")).toBe(true)
  })

  it("works with no title", () => {
    expect(chunkStructuredText(["Just a line of text here."], "")).toEqual(["Just a line of text here."])
  })
})
