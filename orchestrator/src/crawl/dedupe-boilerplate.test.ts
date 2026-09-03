import { describe, it, expect } from "vitest"
import { dedupeBoilerplate, MIN_PAGES_FOR_DEDUPE } from "./dedupe-boilerplate.js"

const FOOTER = "Copyright 2026 Acme Ltd. All rights reserved."
const ADDRESS = "12 Bode Thomas, Surulere, Lagos"

function site(n: number, unique: (i: number) => string) {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://e.com/p${i}`,
    blocks: [FOOTER, ADDRESS, unique(i)],
  }))
}

describe("dedupeBoilerplate", () => {
  it("removes a footer repeated across every page", () => {
    const { pages, dropped } = dedupeBoilerplate(site(5, (i) => `Unique content for page ${i}`))
    for (const p of pages) {
      expect(p.blocks).not.toContain(FOOTER)
      expect(p.blocks).not.toContain(ADDRESS)
      expect(p.blocks.some((b) => b.startsWith("Unique content"))).toBe(true)
    }
    expect(dropped).toContain(FOOTER)
  })

  it("keeps a block that appears on only a minority of pages", () => {
    const pages = [
      { url: "a", blocks: ["shared", "only here"] },
      { url: "b", blocks: ["shared", "x"] },
      { url: "c", blocks: ["y"] },
      { url: "d", blocks: ["z"] },
      { url: "e", blocks: ["w"] },
    ]
    const { pages: out } = dedupeBoilerplate(pages)
    // "shared" is on 2 of 5 — under the 60% bar, so it stays.
    expect(out[0].blocks).toContain("shared")
    expect(out[0].blocks).toContain("only here")
  })

  // A 2-page site legitimately repeats things; stripping there would gut it.
  it("is a no-op below the minimum page count", () => {
    const pages = [
      { url: "a", blocks: [FOOTER, "one"] },
      { url: "b", blocks: [FOOTER, "two"] },
    ]
    const { pages: out, dropped } = dedupeBoilerplate(pages)
    expect(out).toEqual(pages)
    expect(dropped).toEqual([])
    expect(pages.length).toBeLessThan(MIN_PAGES_FOR_DEDUPE)
  })

  it("matches despite whitespace and case differences", () => {
    const pages = [
      { url: "a", blocks: ["Call  us  TODAY", "a content block"] },
      { url: "b", blocks: ["call us today", "b content block"] },
      { url: "c", blocks: ["CALL US   TODAY", "c content block"] },
    ]
    const { pages: out } = dedupeBoilerplate(pages)
    for (const p of out) expect(p.blocks).toHaveLength(1)
  })

  it("does not double-count a block repeated twice on one page", () => {
    const pages = [
      { url: "a", blocks: ["nav", "nav", "real content here"] },
      { url: "b", blocks: ["b only"] },
      { url: "c", blocks: ["c only"] },
      { url: "d", blocks: ["d only"] },
      { url: "e", blocks: ["e only"] },
    ]
    const { pages: out } = dedupeBoilerplate(pages)
    // "nav" is on 1 of 5 pages despite appearing twice — it must survive.
    expect(out[0].blocks).toContain("nav")
  })

  it("preserves page order and urls", () => {
    const { pages } = dedupeBoilerplate(site(4, (i) => `body ${i}`))
    expect(pages.map((p) => p.url)).toEqual(["https://e.com/p0", "https://e.com/p1", "https://e.com/p2", "https://e.com/p3"])
  })
})
