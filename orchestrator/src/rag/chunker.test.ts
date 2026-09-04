import { describe, it, expect } from "vitest"
import { chunkText, chunkStructuredText } from "./chunker.js"

describe("chunkText — structure-aware", () => {
  // This function was frozen: 1,867 live chunks came from its old whitespace-
  // flattening behaviour and there was no way to rebuild them. It was unfrozen
  // once POST /v1/documents/:id/reindex existed, because the old behaviour was
  // producing false answers — see the sibling-sections test below, which is
  // taken from the document that caused it.
  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([])
    expect(chunkText("   \n  ")).toEqual([])
  })

  it("keeps a short document in one chunk", () => {
    expect(chunkText("One short line about delivery.")).toEqual(["One short line about delivery."])
  })

  it("no longer flattens newlines away", () => {
    // The old version joined every word with a single space, which is what
    // destroyed table rows and section boundaries.
    const table = "| Location | Fee |\n| Lagos | 150,000 |\n| Abuja | 200,000 |"
    expect(chunkText(table)[0]).toContain("\n")
  })

  it("does not put two sibling sections in one chunk — the P&E bug", () => {
    // Shape taken from the knowledge base that told a customer the Abuja office
    // was at the Lagos address. Each flow must be retrievable on its own.
    const doc = [
      "**Example Conversation Flow (Lagos):**",
      "Customer: I'm in Lagos.",
      'Bot: "Our Lagos office is at Chellarms PLC Compound, Apapa Oshodi Expressway."',
      "",
      "**Example Conversation Flow (Abuja):**",
      "Customer: I'm in Abuja.",
      'Bot: "There will be a logistics cost to bring the goods to you."',
    ].join("\n")

    const chunks = chunkText(doc)
    const withLagosAddress = chunks.filter((c) => c.includes("Chellarms"))
    expect(withLagosAddress).toHaveLength(1)
    // The chunk carrying the Lagos address must not also be the Abuja section.
    expect(withLagosAddress[0]).not.toContain("I'm in Abuja")
  })

  it("carries the section heading into each chunk", () => {
    const doc = "## Pricing\n\nThe 11KVA package is 5,800,000 naira."
    expect(chunkText(doc)[0]).toContain("Pricing")
  })

  it("lets a subsection stay with its parent", () => {
    // Nesting is not sibling rivalry — "## Fees" belongs under "# Delivery".
    const doc = "# Delivery\n\nWe deliver nationwide.\n\n## Fees\n\nIkeja is 2,000 naira."
    expect(chunkText(doc)).toHaveLength(1)
  })

  it("still splits a document that exceeds the size budget", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}. ` + "word ".repeat(30)).join("\n\n")
    expect(chunkText(long).length).toBeGreaterThan(1)
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
