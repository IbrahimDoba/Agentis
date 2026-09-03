import { safeFetch, type SafeFetchResult, CRAWL_USER_AGENT } from "../lib/safe-fetch.js"
import { Frontier, normalizeUrl, MAX_PAGES } from "./frontier.js"
import { parseRobots, isAllowed, parseSitemap, ALLOW_ALL, type RobotsRules } from "./robots.js"
import { htmlToText, wordCount } from "./html-to-text.js"
import { dedupeBoilerplate } from "./dedupe-boilerplate.js"

// The crawl loop. The only impure file in this directory — everything it
// decides is delegated to the pure modules beside it, so this stays a loop.

export const TOTAL_DEADLINE_MS = 120_000
export const POLITENESS_MS = 300
/** Three failures in a row means the site is down or blocking us; stop asking. */
export const MAX_CONSECUTIVE_FAILURES = 3
export const MAX_TOTAL_TEXT_BYTES = 1_500_000
/**
 * Under this many words a page is an empty shell, not content. Deliberately
 * low: a JS shell has ~0 words, while a real contact or thank-you page can be
 * genuinely terse. A higher bar flags those as "JavaScript-rendered" and
 * refuses a site we could have read perfectly well.
 */
export const MIN_WORDS_PER_PAGE = 20
/** If this share of fetched pages are empty shells, the site needs JavaScript. */
export const JS_RENDERED_RATIO = 0.6
/**
 * The ratio above is meaningless on a tiny sample — with one page, a single
 * terse contact page is "100% shells". Below this many pages, fall back to
 * judging the crawl by its total word count instead.
 */
export const MIN_PAGES_FOR_JS_RATIO = 3
/**
 * A whole crawl yielding less than this returned nothing usable. Set low on
 * purpose: an empty SPA shell has near-zero words, whereas a real one-page
 * contact site ("Call us on X, we are at Y, open Monday to Friday") is
 * legitimately thin and must not be rejected.
 */
export const MIN_TOTAL_WORDS = 10

export interface CrawledPage {
  url: string
  title: string
  blocks: string[]
}

export interface CrawlResult {
  pages: CrawledPage[]
  pagesCrawled: number
  pagesFailed: number
  pagesSkipped: number
  deadlineHit: boolean
  robotsBlockedSeed: boolean
  /** True when the site returned shells — the operator needs telling. */
  jsRendered: boolean
  /** The site stopped responding partway. Pages already gathered are kept. */
  unreachable: boolean
  droppedBoilerplate: string[]
  failure?: string
}

export interface CrawlDeps {
  fetch: (url: string, opts: { signal?: AbortSignal }) => Promise<SafeFetchResult>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

const defaultDeps: CrawlDeps = {
  fetch: (url, opts) => safeFetch(url, opts),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
}

export interface CrawlOptions {
  maxPages?: number
  deadlineMs?: number
  signal?: AbortSignal
}

/** robots.txt for the origin. Any failure allows everything, per the standard. */
async function loadRobots(origin: string, d: CrawlDeps, signal?: AbortSignal): Promise<RobotsRules> {
  const res = await d.fetch(`${origin}/robots.txt`, { signal }).catch(() => null)
  if (!res || !res.ok) return ALLOW_ALL
  return parseRobots(res.body, CRAWL_USER_AGENT)
}

/** Sitemap URLs from robots, else the conventional location. */
async function loadSitemapUrls(
  origin: string,
  robots: RobotsRules,
  d: CrawlDeps,
  signal?: AbortSignal
): Promise<string[]> {
  const candidates = robots.sitemaps.length > 0 ? robots.sitemaps : [`${origin}/sitemap.xml`]
  const urls: string[] = []
  // One level only — no sitemapindex recursion.
  for (const sm of candidates.slice(0, 2)) {
    const res = await d.fetch(sm, { signal }).catch(() => null)
    if (res?.ok) urls.push(...parseSitemap(res.body))
  }
  return urls
}

/**
 * Crawl a site starting from `seedUrl`. Never throws for an unreachable or
 * hostile site — a failure is reported in the result so the caller can store it
 * against the document.
 */
export async function crawlSite(
  seedUrl: string,
  opts: CrawlOptions = {},
  deps: Partial<CrawlDeps> = {}
): Promise<CrawlResult> {
  const d: CrawlDeps = { ...defaultDeps, ...deps }
  const maxPages = opts.maxPages ?? MAX_PAGES
  const deadline = d.now() + (opts.deadlineMs ?? TOTAL_DEADLINE_MS)

  const empty: CrawlResult = {
    pages: [], pagesCrawled: 0, pagesFailed: 0, pagesSkipped: 0,
    deadlineHit: false, robotsBlockedSeed: false, jsRendered: false,
    unreachable: false, droppedBoilerplate: [],
  }

  const normalizedSeed = normalizeUrl(seedUrl)
  if (!normalizedSeed) return { ...empty, failure: "invalid_url" }

  const seed = new URL(normalizedSeed)
  const origin = seed.origin

  const robots = await loadRobots(origin, d, opts.signal)
  if (!isAllowed(robots, seed.pathname + seed.search)) {
    return { ...empty, robotsBlockedSeed: true, failure: "robots_disallowed" }
  }

  const politeness = Math.max(robots.crawlDelayMs ?? 0, POLITENESS_MS)
  const frontier = new Frontier(seed.hostname, maxPages)
  frontier.add(normalizedSeed, 0)

  for (const url of await loadSitemapUrls(origin, robots, d, opts.signal)) {
    frontier.add(url, 1)
  }

  const fetched: { url: string; title: string; blocks: string[]; words: number }[] = []
  let pagesFailed = 0
  let pagesSkipped = 0
  let consecutiveFailures = 0
  let totalBytes = 0
  let deadlineHit = false
  let unreachable = false

  for (let item = frontier.next(); item; item = frontier.next()) {
    if (d.now() >= deadline) {
      deadlineHit = true
      break
    }
    if (opts.signal?.aborted) {
      deadlineHit = true
      break
    }
    const parsed = new URL(item.url)
    // Include the query: rules such as "Disallow: /*?" can never match a bare
    // pathname.
    if (!isAllowed(robots, parsed.pathname + parsed.search)) {
      pagesSkipped++
      continue
    }

    const res = await d.fetch(item.url, { signal: opts.signal })

    if (!res.ok) {
      pagesFailed++
      consecutiveFailures++
      // Not-HTML is a routine skip, not evidence the site is broken.
      if (res.reason === "unsupported_content_type") {
        pagesSkipped++
        pagesFailed--
        consecutiveFailures = 0
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // Keep what we already extracted — a site that dies after 18 good pages
        // should still contribute those 18, not nothing.
        unreachable = true
        break
      }
      await d.sleep(politeness)
      continue
    }

    consecutiveFailures = 0
    const page = htmlToText(res.body, res.url)

    // Follow links even from a noindex page — it may be the only route to the
    // pages we do want — but never store its text.
    if (!page.nofollow) {
      for (const link of page.links) frontier.add(link, item.depth + 1, res.url)
    }

    if (page.noindex) {
      pagesSkipped++
      await d.sleep(politeness)
      continue
    }

    const words = wordCount(page.blocks)
    const bytes = page.blocks.join("\n").length
    if (totalBytes + bytes > MAX_TOTAL_TEXT_BYTES) break
    totalBytes += bytes

    fetched.push({ url: res.url, title: page.title, blocks: page.blocks, words })
    await d.sleep(politeness)
  }

  if (fetched.length === 0) {
    return {
      ...empty, pagesFailed, pagesSkipped, deadlineHit,
      unreachable,
      failure: unreachable ? "site_unreachable" : "no_pages_extracted",
    }
  }

  // A site whose pages are nearly all empty is rendering with JavaScript. Say so
  // rather than storing a few hundred characters of shell markup. On a small
  // crawl the ratio proves nothing, so judge the total instead.
  const totalWords = fetched.reduce((n, p) => n + p.words, 0)
  const shells = fetched.filter((p) => p.words < MIN_WORDS_PER_PAGE).length
  const jsRendered =
    fetched.length >= MIN_PAGES_FOR_JS_RATIO
      ? shells / fetched.length >= JS_RENDERED_RATIO
      : totalWords < MIN_TOTAL_WORDS
  if (jsRendered) {
    return {
      ...empty,
      pagesCrawled: fetched.length, pagesFailed, pagesSkipped, deadlineHit,
      unreachable, jsRendered: true, failure: "javascript_rendered",
    }
  }

  const { pages: cleaned, dropped } = dedupeBoilerplate(
    fetched.map((p) => ({ url: p.url, blocks: p.blocks }))
  )
  const titleByUrl = new Map(fetched.map((p) => [p.url, p.title]))

  return {
    pages: cleaned
      .map((p) => ({ url: p.url, title: titleByUrl.get(p.url) ?? "", blocks: p.blocks }))
      .filter((p) => p.blocks.length > 0),
    pagesCrawled: fetched.length,
    pagesFailed,
    pagesSkipped,
    deadlineHit,
    robotsBlockedSeed: false,
    jsRendered: false,
    unreachable,
    droppedBoilerplate: dropped,
  }
}
