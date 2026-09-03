import { describe, it, expect } from "vitest"
import {
  normalizeUrl, isSameSite, siteKey, skipReason, sectionOf,
  Frontier, MAX_PER_SECTION, MAX_QUERY_VARIANTS_PER_PATH,
} from "./frontier.js"

describe("normalizeUrl", () => {
  it("collapses forms of the same page to one key", () => {
    const canonical = normalizeUrl("https://example.com/about")
    for (const variant of [
      "https://example.com/about/",
      "https://example.com/about#team",
      "https://example.com/about?utm_source=twitter",
      "https://example.com/about?fbclid=xyz&utm_medium=social",
      "https://EXAMPLE.com/about",
      "https://example.com:443/about",
    ]) {
      expect(normalizeUrl(variant)).toBe(canonical)
    }
  })

  it("keeps meaningful query params and sorts them", () => {
    expect(normalizeUrl("https://example.com/p?b=2&a=1")).toBe(normalizeUrl("https://example.com/p?a=1&b=2"))
    expect(normalizeUrl("https://example.com/p?a=1")).not.toBe(normalizeUrl("https://example.com/p?a=2"))
  })

  it("keeps the root slash but strips a trailing one elsewhere", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/")
    expect(normalizeUrl("https://example.com/a/b/")).toBe("https://example.com/a/b")
  })

  it("resolves against a base", () => {
    expect(normalizeUrl("/pricing", "https://example.com/a/b")).toBe("https://example.com/pricing")
    expect(normalizeUrl("../up", "https://example.com/a/b/c")).toBe("https://example.com/a/up")
  })

  it("rejects non-http schemes and junk", () => {
    for (const bad of ["mailto:a@b.com", "tel:+123", "javascript:void(0)", "not a url"]) {
      expect(normalizeUrl(bad)).toBeNull()
    }
  })

  it("strips credentials", () => {
    expect(normalizeUrl("https://user:pw@example.com/a")).toBe("https://example.com/a")
  })
})

describe("isSameSite", () => {
  it("treats www and apex as the same site", () => {
    expect(isSameSite("example.com", "www.example.com")).toBe(true)
    expect(siteKey("WWW.Example.com")).toBe("example.com")
  })

  it("excludes subdomains", () => {
    expect(isSameSite("blog.example.com", "example.com")).toBe(false)
  })

  // The endsWith() footgun: evil-example.com must not pass as example.com.
  it("excludes a lookalike domain", () => {
    expect(isSameSite("evil-example.com", "example.com")).toBe(false)
    expect(isSameSite("example.com.attacker.net", "example.com")).toBe(false)
  })
})

describe("skipReason", () => {
  it("skips binaries and assets by extension", () => {
    for (const u of [
      "https://e.com/a.pdf", "https://e.com/x.jpg", "https://e.com/s.css",
      "https://e.com/b.zip", "https://e.com/v.mp4", "https://e.com/f.woff2",
    ]) {
      expect(skipReason(u)).toMatch(/^extension_/)
    }
  })

  it("keeps ordinary pages, including extensionless and .html", () => {
    for (const u of ["https://e.com/about", "https://e.com/about.html", "https://e.com/"]) {
      expect(skipReason(u)).toBeNull()
    }
  })

  it("skips login, cart and admin paths", () => {
    for (const u of [
      "https://e.com/wp-admin/", "https://e.com/login", "https://e.com/checkout",
      "https://e.com/cart", "https://e.com/search", "https://e.com/tag/news",
    ]) {
      expect(skipReason(u)).toBe("non_content_path")
    }
  })

  it("does not skip a path that merely contains a keyword as a substring", () => {
    expect(skipReason("https://e.com/logins-explained")).toBeNull()
    expect(skipReason("https://e.com/cartography")).toBeNull()
  })

  it("skips a URL with too many query params", () => {
    expect(skipReason("https://e.com/p?a=1&b=2&c=3")).toBe("too_many_query_params")
  })
})

describe("sectionOf", () => {
  it("returns the first path segment, or / at the root", () => {
    expect(sectionOf("https://e.com/blog/post-1")).toBe("blog")
    expect(sectionOf("https://e.com/")).toBe("/")
  })
})

describe("Frontier", () => {
  const f = () => new Frontier("example.com", 25)

  it("accepts a same-site page once", () => {
    const q = f()
    expect(q.add("https://example.com/a", 0)).toBe(true)
    expect(q.add("https://example.com/a/", 0)).toBe(false) // same page normalised
    expect(q.queued).toBe(1)
  })

  it("rejects other sites, skipped paths and over-deep links", () => {
    const q = f()
    expect(q.add("https://other.com/a", 0)).toBe(false)
    expect(q.add("https://example.com/a.pdf", 0)).toBe(false)
    expect(q.add("https://example.com/deep", 4)).toBe(false)
  })

  it("accepts www as the same site", () => {
    const q = f()
    expect(q.add("https://www.example.com/a", 0)).toBe(true)
  })

  it("honours the total page cap", () => {
    const q = new Frontier("example.com", 3)
    for (let i = 0; i < 10; i++) q.add(`https://example.com/s${i}/p`, 0)
    let taken = 0
    while (q.next()) taken++
    expect(taken).toBe(3)
  })

  // A blog with 50 posts must not consume every slot.
  it("caps pages per first path segment", () => {
    const q = f()
    for (let i = 0; i < 20; i++) q.add(`https://example.com/blog/post-${i}`, 1)
    q.add("https://example.com/pricing", 1)
    const taken: string[] = []
    for (let item = q.next(); item; item = q.next()) taken.push(item.url)
    expect(taken.filter((u) => u.includes("/blog/")).length).toBe(MAX_PER_SECTION)
    // The page that matters still gets crawled.
    expect(taken.some((u) => u.endsWith("/pricing"))).toBe(true)
  })

  it("caps query variants of the same path", () => {
    const q = f()
    let accepted = 0
    for (let i = 0; i < 10; i++) if (q.add(`https://example.com/shop?colour=c${i}`, 1)) accepted++
    expect(accepted).toBe(MAX_QUERY_VARIANTS_PER_PATH)
  })

  it("resolves relative links against the page they were found on", () => {
    const q = f()
    expect(q.add("/pricing", 1, "https://example.com/a/b")).toBe(true)
    expect(q.next()?.url).toBe("https://example.com/pricing")
  })

  it("reports pages taken", () => {
    const q = f()
    q.add("https://example.com/a", 0)
    q.next()
    expect(q.pagesTaken).toBe(1)
  })
})
