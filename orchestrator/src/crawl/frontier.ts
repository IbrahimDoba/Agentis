// URL bookkeeping for a crawl: what counts as the same page, what counts as the
// same site, what to skip, and when to stop.
//
// Pure — no fetching, no DNS. Everything here is a decision about a string, so
// the rules that keep a crawl bounded are testable in isolation.

export const MAX_PAGES = 25
/** Stops a blog archive eating every slot while /pricing is never reached. */
export const MAX_PER_SECTION = 8
/** Stops a filtered catalogue generating endless ?colour=… variants. */
export const MAX_QUERY_VARIANTS_PER_PATH = 3
export const MAX_QUERY_PARAMS = 2
export const MAX_DEPTH = 3

const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ref", "referrer",
  "_ga", "_gl", "sessionid", "phpsessid", "jsessionid",
]

const SKIP_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv",
  "zip", "rar", "7z", "tar", "gz", "dmg", "exe", "apk", "pkg",
  "mp3", "wav", "mp4", "mov", "avi", "mkv", "webm",
  "jpg", "jpeg", "png", "gif", "svg", "webp", "avif", "ico", "bmp", "tiff",
  "css", "js", "mjs", "json", "xml", "rss", "atom",
  "woff", "woff2", "ttf", "otf", "eot",
])

/** Paths that are never useful content and often cost a session or a redirect. */
const SKIP_PATH = /\/(wp-admin|wp-login|wp-json|xmlrpc|login|sign-?in|sign-?up|register|logout|account|profile|cart|basket|checkout|admin|search|feed|rss|tag|tags|author|comment|reply|share|print|amp)(\/|$)/i

/** example.com and www.example.com are the same site; blog.example.com is not. */
export function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "")
}

export function isSameSite(a: string, b: string): boolean {
  return siteKey(a) === siteKey(b)
}

/**
 * Canonical form used as the visited key. Two URLs that render the same page
 * must produce the same string, or we crawl the homepage five times.
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  let url: URL
  try {
    url = base ? new URL(raw, base) : new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  url.hash = ""
  url.hostname = url.hostname.toLowerCase()
  url.username = ""
  url.password = ""
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = ""
  }

  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.includes(k.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  url.search = ""
  for (const [k, v] of params) url.searchParams.append(k, v)

  // Trailing slash is meaningless except at the root.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "")
  }

  return url.toString()
}

/** Why this URL should not be fetched, or null if it is fine. */
export function skipReason(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "unparseable"
  }

  const lastSegment = url.pathname.split("/").pop() ?? ""
  const dot = lastSegment.lastIndexOf(".")
  if (dot > 0) {
    const ext = lastSegment.slice(dot + 1).toLowerCase()
    if (SKIP_EXTENSIONS.has(ext)) return `extension_${ext}`
  }

  if (SKIP_PATH.test(url.pathname)) return "non_content_path"
  if ([...url.searchParams.keys()].length > MAX_QUERY_PARAMS) return "too_many_query_params"

  return null
}

/** First path segment, used for the per-section fairness cap. */
export function sectionOf(raw: string): string {
  try {
    const seg = new URL(raw).pathname.split("/").filter(Boolean)[0]
    return seg ? seg.toLowerCase() : "/"
  } catch {
    return "/"
  }
}

function pathOnly(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.hostname}${u.pathname}`
  } catch {
    return raw
  }
}

export interface FrontierItem {
  url: string
  depth: number
}

/**
 * The crawl queue. Owns every "should we take this one" decision so the fetch
 * loop stays a loop and the rules stay testable.
 */
export class Frontier {
  private readonly seen = new Set<string>()
  private readonly queue: FrontierItem[] = []
  private readonly sectionCount = new Map<string, number>()
  private readonly queryVariants = new Map<string, number>()
  private taken = 0

  constructor(
    private readonly originHost: string,
    private readonly maxPages: number = MAX_PAGES
  ) {}

  /** Returns true if the URL was accepted onto the queue. */
  add(raw: string, depth: number, base?: string): boolean {
    if (depth > MAX_DEPTH) return false

    const normalized = normalizeUrl(raw, base)
    if (!normalized) return false
    if (this.seen.has(normalized)) return false

    let host: string
    try {
      host = new URL(normalized).hostname
    } catch {
      return false
    }
    if (!isSameSite(host, this.originHost)) return false
    if (skipReason(normalized)) return false

    const path = pathOnly(normalized)
    const variants = this.queryVariants.get(path) ?? 0
    if (variants >= MAX_QUERY_VARIANTS_PER_PATH) return false

    // Mark seen at enqueue time, not at fetch time, or a page linked from five
    // others gets queued five times.
    this.seen.add(normalized)
    this.queryVariants.set(path, variants + 1)
    this.queue.push({ url: normalized, depth })
    return true
  }

  /** Next URL to fetch, honouring the page and per-section caps. */
  next(): FrontierItem | null {
    while (this.queue.length > 0) {
      if (this.taken >= this.maxPages) return null
      const item = this.queue.shift()!
      const section = sectionOf(item.url)
      const count = this.sectionCount.get(section) ?? 0
      if (count >= MAX_PER_SECTION) continue // over its share; try the next one
      this.sectionCount.set(section, count + 1)
      this.taken++
      return item
    }
    return null
  }

  get pagesTaken(): number {
    return this.taken
  }

  get queued(): number {
    return this.queue.length
  }
}
