// Cross-page boilerplate removal.
//
// Selector heuristics only catch chrome that is marked up as chrome. Plenty of
// sites put their address, opening hours strip or CTA in a plain <div> that no
// selector list will ever match, and it then appears in all 25 pages and eats
// chunk budget.
//
// The signal that actually generalises is repetition: a block that appears on
// most pages of a site is site furniture, not page content. Pure function over
// the whole crawl, so it can only run once every page is fetched.

/** A block on this share of pages (or more) is furniture. */
export const REPEAT_RATIO = 0.6
/** Below this many pages, repetition means nothing — a 2-page site legitimately repeats. */
export const MIN_PAGES_FOR_DEDUPE = 3

export interface PageBlocks {
  url: string
  blocks: string[]
}

function key(block: string): string {
  return block.replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * Drop blocks that repeat across most pages. Returns pages in the same order
 * with their boilerplate removed, plus what was dropped (useful in logs when an
 * operator asks why some text is missing).
 */
export function dedupeBoilerplate(
  pages: PageBlocks[],
  repeatRatio: number = REPEAT_RATIO
): { pages: PageBlocks[]; dropped: string[] } {
  if (pages.length < MIN_PAGES_FOR_DEDUPE) return { pages, dropped: [] }

  const pageCount = new Map<string, number>()
  for (const page of pages) {
    // Count each distinct block once per page: a nav repeated twice on one page
    // must not count as two pages' worth of evidence.
    for (const k of new Set(page.blocks.map(key))) {
      pageCount.set(k, (pageCount.get(k) ?? 0) + 1)
    }
  }

  const threshold = Math.max(MIN_PAGES_FOR_DEDUPE, Math.ceil(pages.length * repeatRatio))
  const boilerplate = new Set<string>()
  for (const [k, count] of pageCount) {
    if (count >= threshold) boilerplate.add(k)
  }

  const dropped: string[] = []
  const cleaned = pages.map((page) => {
    const kept: string[] = []
    for (const block of page.blocks) {
      if (boilerplate.has(key(block))) {
        if (!dropped.includes(block)) dropped.push(block)
        continue
      }
      kept.push(block)
    }
    return { url: page.url, blocks: kept }
  })

  return { pages: cleaned, dropped }
}
