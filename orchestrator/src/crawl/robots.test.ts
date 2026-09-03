import { describe, it, expect } from "vitest"
import { parseRobots, isAllowed, parseSitemap, MAX_CRAWL_DELAY_MS } from "./robots.js"

const UA = "DailzeroBot/1.0"
const allowedIn = (txt: string, path: string) => isAllowed(parseRobots(txt, UA), path)

describe("parseRobots — failing open", () => {
  it("allows everything for empty, whitespace or malformed input", () => {
    for (const txt of ["", "   \n\n", "this is not robots syntax", "<html>404</html>"]) {
      expect(allowedIn(txt, "/anything")).toBe(true)
    }
  })

  it("allows everything when no group applies to us", () => {
    expect(allowedIn("User-agent: Googlebot\nDisallow: /", "/x")).toBe(true)
  })
})

describe("parseRobots — group selection", () => {
  const txt = [
    "User-agent: *", "Disallow: /private",
    "", "User-agent: DailzeroBot", "Disallow: /secret",
  ].join("\n")

  it("prefers a group naming us over the wildcard", () => {
    expect(allowedIn(txt, "/secret/x")).toBe(false)
    // The wildcard group's rules do not apply once a specific group matched.
    expect(allowedIn(txt, "/private/x")).toBe(true)
  })

  it("falls back to the wildcard when we are not named", () => {
    expect(allowedIn("User-agent: *\nDisallow: /private", "/private/x")).toBe(false)
  })

  it("treats consecutive user-agent lines as one group", () => {
    const t = "User-agent: Googlebot\nUser-agent: DailzeroBot\nDisallow: /both"
    expect(allowedIn(t, "/both/x")).toBe(false)
  })
})

describe("parseRobots — regressions from review", () => {
  // includes("") is true for every string, so a blank User-agent value matched
  // every crawler AND outranked the * group: one stray line blocked everything.
  it("ignores a User-agent line with an empty value", () => {
    const t = "User-agent:\nDisallow: /\n\nUser-agent: *\nDisallow: /private"
    expect(allowedIn(t, "/anything")).toBe(true)
    expect(allowedIn(t, "/private/x")).toBe(false)
  })

  // Our UA embeds a URL, so a substring match let "bot", "dail" or "com" claim
  // a group meant for someone else entirely.
  it("does not match a group aimed at a different crawler", () => {
    for (const other of ["bot", "com", "dail", "GPTBot", "commonCrawl"]) {
      expect(allowedIn(`User-agent: ${other}\nDisallow: /`, "/x")).toBe(true)
    }
  })

  it("still matches our own agent by its product token", () => {
    expect(allowedIn("User-agent: DailzeroBot\nDisallow: /x", "/x/y")).toBe(false)
    expect(allowedIn("User-agent: dailzerobot\nDisallow: /x", "/x/y")).toBe(false)
  })

  // A Sitemap line between two User-agent lines merged the groups, leaking one
  // crawler's Disallow onto another.
  it("does not merge groups separated by a Sitemap line", () => {
    const t = "User-agent: GPTBot\nSitemap: https://e.com/s.xml\nUser-agent: *\nDisallow: /open"
    expect(allowedIn(t, "/open/x")).toBe(false)
  })
})

describe("isAllowed — rules", () => {
  it("Disallow: / blocks everything", () => {
    expect(allowedIn("User-agent: *\nDisallow: /", "/")).toBe(false)
    expect(allowedIn("User-agent: *\nDisallow: /", "/a/b")).toBe(false)
  })

  it("an empty Disallow allows everything", () => {
    expect(allowedIn("User-agent: *\nDisallow:", "/anything")).toBe(true)
  })

  it("longest match wins, and Allow wins a tie", () => {
    const t = "User-agent: *\nDisallow: /admin\nAllow: /admin/public"
    expect(allowedIn(t, "/admin/secret")).toBe(false)
    expect(allowedIn(t, "/admin/public/page")).toBe(true)
  })

  it("supports * and $ wildcards", () => {
    expect(allowedIn("User-agent: *\nDisallow: /*.pdf$", "/files/a.pdf")).toBe(false)
    expect(allowedIn("User-agent: *\nDisallow: /*.pdf$", "/files/a.pdf?x=1")).toBe(true)
    expect(allowedIn("User-agent: *\nDisallow: /a/*/c", "/a/b/c")).toBe(false)
  })

  it("ignores comments and blank lines", () => {
    const t = "# comment\nUser-agent: *   # us\nDisallow: /x  # nope\n\n"
    expect(allowedIn(t, "/x/y")).toBe(false)
    expect(allowedIn(t, "/y")).toBe(true)
  })
})

describe("crawl-delay and sitemaps", () => {
  it("reads crawl-delay in seconds and clamps it", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 1", UA).crawlDelayMs).toBe(1000)
    expect(parseRobots("User-agent: *\nCrawl-delay: 3600", UA).crawlDelayMs).toBe(MAX_CRAWL_DELAY_MS)
    expect(parseRobots("User-agent: *\nCrawl-delay: nonsense", UA).crawlDelayMs).toBeNull()
  })

  it("collects sitemaps regardless of group", () => {
    const t = "Sitemap: https://e.com/sitemap.xml\nUser-agent: *\nDisallow: /x\nSitemap: https://e.com/two.xml"
    expect(parseRobots(t, UA).sitemaps).toEqual(["https://e.com/sitemap.xml", "https://e.com/two.xml"])
  })
})

describe("parseSitemap", () => {
  it("extracts loc urls", () => {
    const xml = `<urlset><url><loc>https://e.com/a</loc></url><url><loc> https://e.com/b </loc></url></urlset>`
    expect(parseSitemap(xml)).toEqual(["https://e.com/a", "https://e.com/b"])
  })

  it("honours the limit and tolerates junk", () => {
    const xml = Array.from({ length: 20 }, (_, i) => `<loc>https://e.com/${i}</loc>`).join("")
    expect(parseSitemap(xml, 5)).toHaveLength(5)
    expect(parseSitemap("not xml at all")).toEqual([])
  })
})
