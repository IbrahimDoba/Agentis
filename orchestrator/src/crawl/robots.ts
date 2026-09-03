// robots.txt, parsed by hand.
//
// The spec that matters is small — User-agent grouping, Allow/Disallow with
// longest-match wins, `*` and `$` wildcards, Sitemap, Crawl-delay — and a
// dependency for ~80 lines is not worth the supply chain. Pure: the caller
// fetches the file, this decides what it means.
//
// Fails OPEN. A missing, empty or malformed robots.txt allows everything, which
// is what the standard says and what every other crawler does.

export interface RobotsRules {
  allow: string[]
  disallow: string[]
  crawlDelayMs: number | null
  sitemaps: string[]
}

/** Never let a hostile or careless Crawl-delay stall a crawl. */
export const MAX_CRAWL_DELAY_MS = 2_000

export const ALLOW_ALL: RobotsRules = { allow: [], disallow: [], crawlDelayMs: null, sitemaps: [] }

function stripComment(line: string): string {
  const i = line.indexOf("#")
  return (i === -1 ? line : line.slice(0, i)).trim()
}

/**
 * Parse robots.txt for one user agent.
 *
 * Groups are selected the way the standard describes: a group naming our agent
 * wins outright; otherwise the `*` group applies. Sitemap directives are
 * non-group and collected wherever they appear.
 */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  if (!text || !text.trim()) return ALLOW_ALL

  const ua = userAgent.toLowerCase()
  const sitemaps: string[] = []

  // Collect every group so we can prefer a specific match over the wildcard.
  const groups: { agents: string[]; allow: string[]; disallow: string[]; delay: number | null }[] = []
  let current: (typeof groups)[number] | null = null
  let lastLineWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine)
    if (!line) continue
    const sep = line.indexOf(":")
    if (sep === -1) continue

    const field = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()

    if (field === "sitemap") {
      if (value) sitemaps.push(value)
      // Not a group member, but it does end a run of User-agent lines.
      lastLineWasAgent = false
      continue
    }

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group.
      if (!current || !lastLineWasAgent) {
        current = { agents: [], allow: [], disallow: [], delay: null }
        groups.push(current)
      }
      // Drop empty values: "" would match every agent via includes().
      if (value) current.agents.push(value.toLowerCase())
      lastLineWasAgent = true
      continue
    }

    lastLineWasAgent = false
    if (!current) continue

    if (field === "disallow") current.disallow.push(value)
    else if (field === "allow") current.allow.push(value)
    else if (field === "crawl-delay") {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) current.delay = Math.min(n * 1000, MAX_CRAWL_DELAY_MS)
    }
  }

  // Match the product token before the slash ("dailzerobot") exactly.
  //
  // Not a substring of the whole UA string: that string embeds a URL, so "bot",
  // "dail" and even "com" would claim a group meant for someone else. And not a
  // prefix match either — that convention exists for crawlers with token
  // variants (Googlebot-News), and ours has none, so it only adds false matches.
  const product = ua.split("/")[0].trim()
  const specific = groups.find((g) => g.agents.some((a) => a !== "" && a !== "*" && a === product))
  const wildcard = groups.find((g) => g.agents.includes("*"))
  const chosen = specific ?? wildcard

  if (!chosen) return { ...ALLOW_ALL, sitemaps }

  return {
    // An empty Disallow value means "allow everything" — drop it rather than
    // treating "" as a prefix that matches every path.
    disallow: chosen.disallow.filter((p) => p !== ""),
    allow: chosen.allow.filter((p) => p !== ""),
    crawlDelayMs: chosen.delay,
    sitemaps,
  }
}

/** Does a robots pattern (with `*` and `$`) match this path? */
function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false
  if (!pattern.includes("*") && !pattern.includes("$")) return path.startsWith(pattern)

  const anchored = pattern.endsWith("$")
  const body = anchored ? pattern.slice(0, -1) : pattern
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path)
}

/**
 * Longest matching rule wins; Allow wins a tie. That tie-break is what lets a
 * site write `Disallow: /admin` + `Allow: /admin/public` and mean it.
 */
export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  let bestDisallow = -1
  let bestAllow = -1

  for (const p of rules.disallow) if (patternMatches(p, pathname)) bestDisallow = Math.max(bestDisallow, p.length)
  for (const p of rules.allow) if (patternMatches(p, pathname)) bestAllow = Math.max(bestAllow, p.length)

  if (bestDisallow === -1) return true
  return bestAllow >= bestDisallow
}

/** Extract <loc> URLs from a sitemap. Regex rather than an XML dependency. */
export function parseSitemap(xml: string, limit = 500): string[] {
  const out: string[] = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
  for (let m = re.exec(xml); m !== null && out.length < limit; m = re.exec(xml)) {
    out.push(m[1].trim())
  }
  return out
}
