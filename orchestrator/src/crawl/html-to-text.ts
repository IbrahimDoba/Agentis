import * as cheerio from "cheerio"

// HTML to structured text.
//
// Pure: takes a string, returns a string. Everything here is fixture-testable.
//
// Structure is preserved deliberately. The existing chunker collapses newlines,
// which is fine for a PDF but throws away exactly what makes a web page useful —
// "## Opening hours" above the hours is the thing that makes the chunk findable.
// chunkStructuredText consumes the blocks below.

export interface ExtractedPage {
  title: string
  /** Text blocks in document order, headings prefixed with #. */
  blocks: string[]
  /** Absolute, same-page-resolved hrefs found in the body. */
  links: string[]
  canonical: string | null
  noindex: boolean
  nofollow: boolean
}

/** Elements that never carry content we want. */
const DROP_TAGS = [
  "script", "style", "noscript", "svg", "iframe", "template", "form",
  "button", "input", "select", "textarea", "video", "audio", "canvas", "picture source",
]

/** Structural chrome. Removed wholesale — it repeats on every page. */
const DROP_STRUCTURAL = ["nav", "header", "footer", "aside"]

/**
 * Boilerplate identified by class/id substring. A heuristic, not a guarantee —
 * cross-page dedupe in dedupe-boilerplate.ts is what actually catches the rest.
 */
const DROP_PATTERNS = [
  "navbar", "sidebar", "masthead", "breadcrumb",
  "cookie", "consent", "gdpr", "newsletter", "subscribe", "popup", "modal",
  "social", "share", "skip-link", "skiplink", "advert", "sponsor",
]

// Deliberately NOT in that list, despite looking like chrome:
//   "menu"    — a restaurant's class="menu-items" is the content we exist to read
//   "related" — "related-products" is useful content
//   "banner"/"promo" — often carries real offers and opening hours
//   "nav"/"header"/"footer" as substrings — the ELEMENTS are already removed
//     above, and the substrings catch "navigation-guide", "page-header" (which
//     holds the h1) and similar.
// Cross-page dedupe in dedupe-boilerplate.ts is what catches the rest, and it
// does so on evidence rather than on a guess about a class name.

/** Where the real content usually lives, best first. */
const MAIN_SELECTORS = [
  "main", "[role=main]", "article", "#content", ".content",
  "#main", ".main", ".post", ".entry-content", ".page-content",
]

/** A block shorter than this is almost always a stray label or icon caption. */
const MIN_BLOCK_WORDS = 3

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

export function htmlToText(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html)

  const title = squash($("title").first().text()) || squash($("h1").first().text()) || ""
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || null

  const robotsMeta = ($('meta[name="robots"]').attr("content") || "").toLowerCase()
  const noindex = robotsMeta.includes("noindex")
  const nofollow = robotsMeta.includes("nofollow")

  // Collect links BEFORE stripping chrome — nav is bad content but a fine map
  // of the site, and it is often the only place section pages are linked.
  const links: string[] = []
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    const rel = ($(el).attr("rel") || "").toLowerCase()
    if (!href || rel.includes("nofollow")) return
    try {
      links.push(new URL(href, pageUrl).toString())
    } catch {
      // Unparseable href — ignore it.
    }
  })

  for (const t of DROP_TAGS) $(t).remove()
  for (const t of DROP_STRUCTURAL) $(t).remove()
  for (const p of DROP_PATTERNS) {
    $(`[class*="${p}" i], [id*="${p}" i]`).remove()
  }
  $("[aria-hidden=true], [hidden]").remove()

  // If a page marks its main content semantically, trust it. The floor only
  // exists to skip an empty wrapper (a "Loading…" shell, or <main> used purely
  // for layout) — it must not reject a page that is legitimately short, which a
  // 100-character bar did.
  const MIN_MAIN_CHARS = 30
  // Resolve to a selector string first: $("body") and $(sel).first() infer
  // different cheerio node types, so choosing the selector and calling $ once
  // keeps this typed without a cast.
  let rootSelector = "body"
  for (const sel of MAIN_SELECTORS) {
    const found = $(sel).first()
    if (found.length > 0 && squash(found.text()).length >= MIN_MAIN_CHARS) {
      rootSelector = sel
      break
    }
  }
  const root = $(rootSelector).first()

  const blocks: string[] = []
  const push = (text: string, prefix = "") => {
    const t = squash(text)
    if (!t) return
    // Headings are kept even when short; they are the retrieval anchor.
    if (!prefix.startsWith("#") && t.split(" ").length < MIN_BLOCK_WORDS) return
    const line = prefix + t
    if (blocks[blocks.length - 1] !== line) blocks.push(line)
  }

  const BLOCK_SELECTOR = "h1, h2, h3, h4, p, li, td, th, blockquote, dd, dt, figcaption"
  root.find(BLOCK_SELECTOR).each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? ""
    // .find() matches ancestors and descendants alike, so <li><p>text</p></li>
    // would emit the text twice — once for the li, once for the p — inflating
    // both the word count and the crawl's byte budget. Let the innermost win.
    if ($(el).find(BLOCK_SELECTOR).length > 0) return
    const text = $(el).text()
    if (tag === "h1") push(text, "# ")
    else if (tag === "h2") push(text, "## ")
    else if (tag === "h3" || tag === "h4") push(text, "### ")
    else if (tag === "li" || tag === "dd" || tag === "dt") push(text, "- ")
    else push(text)
  })

  // A page built entirely of divs yields nothing above; fall back to its text.
  if (blocks.length === 0) {
    const fallback = squash(root.text())
    if (fallback) blocks.push(fallback)
  }

  return { title, blocks, links, canonical, noindex, nofollow }
}

/** Total words extracted — drives the "this site is JavaScript-rendered" check. */
export function wordCount(blocks: string[]): number {
  return blocks.reduce((n, b) => n + b.split(/\s+/).filter(Boolean).length, 0)
}
