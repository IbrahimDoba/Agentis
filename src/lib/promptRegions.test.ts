import { describe, it, expect } from "vitest"
import {
  splitSections,
  scoreRegions,
  selectContext,
  CONTEXT_BUDGET,
  REFUSE_ABOVE,
} from "./promptRegions"

const HEADED = [
  "You are the assistant for Ovie Fabrics.",
  "",
  "## Operating hours",
  "Open Mon-Fri 9am-6pm, Sat 9am-4pm.",
  "",
  "## Refund policy",
  "Returns accepted within 14 days.",
].join("\n")

describe("splitSections", () => {
  it("splits on markdown headings and keeps the preamble", () => {
    const regions = splitSections(HEADED)
    expect(regions.length).toBe(3)
    expect(regions[0].title).toBe("")
    expect(regions[1].title).toBe("## Operating hours")
    expect(regions[2].title).toBe("## Refund policy")
  })

  it("returns absolute offsets that slice back exactly", () => {
    for (const r of splitSections(HEADED)) {
      expect(HEADED.slice(r.start, r.end)).toBe(HEADED.substring(r.start, r.end))
    }
    // The regions must tile the document with no gaps or overlaps.
    const regions = splitSections(HEADED)
    expect(regions[0].start).toBe(0)
    expect(regions[regions.length - 1].end).toBe(HEADED.length)
    for (let i = 1; i < regions.length; i++) expect(regions[i].start).toBe(regions[i - 1].end)
  })

  it("falls back to bold-line headings", () => {
    const doc = "Intro line.\n\n**Hours**\nOpen daily.\n\n**Returns**\n14 days.\n"
    const regions = splitSections(doc)
    expect(regions.map((r) => r.title)).toContain("**Hours**")
  })

  it("falls back to label lines", () => {
    const doc = "Intro.\n\nOperating hours:\nOpen daily.\n\nRefund policy:\n14 days.\n"
    expect(splitSections(doc).length).toBeGreaterThanOrEqual(2)
  })

  it("falls back to paragraphs when there is no heading structure", () => {
    const doc = "First para line.\n\nSecond para line.\n\nThird para line."
    const regions = splitSections(doc)
    expect(regions.length).toBe(3)
    expect(doc.slice(regions[1].start, regions[1].end)).toBe("Second para line.")
  })

  it("windows an unbroken blob, covering it with overlap", () => {
    const doc = "x".repeat(300_000)
    const regions = splitSections(doc)
    expect(regions.length).toBeGreaterThan(1)
    expect(regions[0].start).toBe(0)
    expect(regions[regions.length - 1].end).toBe(doc.length)
    // Consecutive windows must overlap so a straddling target stays whole.
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].start).toBeLessThan(regions[i - 1].end)
    }
  })

  it("returns nothing for an empty document", () => {
    expect(splitSections("")).toEqual([])
  })
})

describe("scoreRegions", () => {
  it("ranks the hours section above the refund section", () => {
    const regions = splitSections(HEADED)
    const scored = scoreRegions(HEADED, regions, "change the closing hours to 7pm")
    const best = [...scored].sort((a, b) => b.score - a.score)[0]
    expect(best.title).toBe("## Operating hours")
  })

  it("scores nothing for an instruction with no locatable terms", () => {
    const regions = splitSections(HEADED)
    const scored = scoreRegions(HEADED, regions, "be more straightforward")
    // "straightforward" expands to tone words that appear nowhere in this doc.
    expect(scored.every((r) => r.score === 0)).toBe(true)
  })
})

describe("selectContext", () => {
  it("sends the whole document under budget and skips sectioning", () => {
    const sel = selectContext(HEADED, "change the closing hours")
    expect(sel.sectioned).toBe(false)
    expect(sel.text).toBe(HEADED)
  })

  it("stays within budget on a large document", () => {
    const filler = (name: string, n: number) => `## ${name}\n` + `${name} detail line.\n`.repeat(n)
    const doc =
      "You are an assistant.\n\n" +
      filler("Operating hours", 20) +
      filler("Shipping", 2000) +
      filler("Warranty", 2000)
    expect(doc.length).toBeGreaterThan(CONTEXT_BUDGET)

    const sel = selectContext(doc, "change the closing hours to 7pm")
    expect(sel.sectioned).toBe(true)
    expect(sel.text.length).toBeLessThanOrEqual(CONTEXT_BUDGET + 2000)
    expect(sel.outline.length).toBeGreaterThan(1)
    expect(sel.text).toContain("Operating hours")
  })

  it("flags noMatch for a tone instruction on a large document", () => {
    const doc = "Assistant.\n\n" + "## Shipping\nShipping detail.\n".repeat(2000)
    const sel = selectContext(doc, "be more straightforward")
    expect(sel.noMatch).toBe(true)
    expect(sel.selectedRegions).toBe(0)
    expect(sel.outline.length).toBeGreaterThan(1)
  })

  it("marks a very large unmatched document as too large to search", () => {
    const doc = "Assistant.\n\n" + "## Shipping\nShipping detail line here.\n".repeat(3000)
    expect(doc.length).toBeGreaterThan(REFUSE_ABOVE)
    const sel = selectContext(doc, "be more straightforward")
    expect(sel.tooLarge).toBe(true)
  })
})
