import { describe, it, expect } from "vitest"
import { crawlSite, MAX_CONSECUTIVE_FAILURES } from "./crawler.js"
import type { SafeFetchResult } from "../lib/safe-fetch.js"

// A whole site expressed as a map of url -> html. `fetch`, `sleep` and `now`
// are injected, so these run instantly with no network and no real delays.

function page(body: string, title = "Page") {
  return `<html><head><title>${title}</title></head><body><main>${body}</main></body></html>`
}

function harness(site: Record<string, string>, opts: { clock?: number[] } = {}) {
  const requested: string[] = []
  let slept = 0
  let tick = 0
  return {
    requested,
    get slept() { return slept },
    deps: {
      fetch: async (url: string): Promise<SafeFetchResult> => {
        requested.push(url)
        const body = site[url]
        // `undefined` means the page 404s (a dead link); an explicit null means
        // the request itself failed, which is what "the site is down" looks like.
        if (body === null) return { ok: false, reason: "network_error", url }
        if (body === undefined) return { ok: false, reason: "http_error", status: 404, url }
        return { ok: true, url, status: 200, contentType: "text/html", body }
      },
      sleep: async (ms: number) => { slept += ms },
      now: () => (opts.clock ? (opts.clock[Math.min(tick++, opts.clock.length - 1)]) : 0),
    },
  }
}

const SEED = "https://example.com/"

describe("crawlSite — happy path", () => {
  const site = {
    "https://example.com/robots.txt": "User-agent: *\nDisallow: /admin",
    "https://example.com/sitemap.xml": "<urlset></urlset>",
    "https://example.com/": page(`<h1>Home</h1><p>Welcome to Acme Fabrics, a wholesale supplier based in Lagos serving tailors and designers across Nigeria since nineteen ninety.</p>
      <a href="/about">About</a><a href="/pricing">Pricing</a>`, "Acme"),
    "https://example.com/about": page("<h1>About</h1><p>We have been trading since nineteen ninety and now supply more than four hundred independent tailors with fabric every single month.</p>", "About"),
    "https://example.com/pricing": page("<h1>Pricing</h1><p>Our wholesale plans start at ten thousand naira per month and include free delivery anywhere within the Lagos mainland area.</p>", "Pricing"),
  }

  it("follows internal links and returns every page", async () => {
    const h = harness(site)
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.pagesCrawled).toBe(3)
    expect(r.pages.map((p) => p.url).sort()).toEqual([
      "https://example.com/", "https://example.com/about", "https://example.com/pricing",
    ])
  })

  it("keeps titles and structured blocks", async () => {
    const r = await crawlSite(SEED, {}, harness(site).deps)
    const pricing = r.pages.find((p) => p.url.endsWith("/pricing"))!
    expect(pricing.title).toBe("Pricing")
    expect(pricing.blocks).toContain("# Pricing")
    expect(pricing.blocks.some((b) => b.includes("ten thousand naira"))).toBe(true)
  })

  it("waits between requests", async () => {
    const h = harness(site)
    await crawlSite(SEED, {}, h.deps)
    expect(h.slept).toBeGreaterThan(0)
  })
})

describe("crawlSite — robots", () => {
  it("refuses when the seed itself is disallowed", async () => {
    const h = harness({
      "https://example.com/robots.txt": "User-agent: *\nDisallow: /",
      "https://example.com/": page("<p>content</p>"),
    })
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.robotsBlockedSeed).toBe(true)
    expect(r.failure).toBe("robots_disallowed")
    expect(r.pages).toHaveLength(0)
  })

  it("skips only the disallowed pages", async () => {
    const h = harness({
      "https://example.com/robots.txt": "User-agent: *\nDisallow: /private",
      "https://example.com/": page(`<p>Home page content here, written out at proper length so that it reads like a genuine page of prose rather than a placeholder, with plenty of ordinary words in it.</p><a href="/private/x">P</a><a href="/ok">OK</a>`),
      "https://example.com/private/x": page("<p>Secret content nobody should index because it sits behind the private path prefix declared in the robots file, and it also runs to a decent length of prose.</p>"),
      "https://example.com/ok": page("<p>Public content that should be indexed and returned to the caller as an ordinary crawled page, written at enough length to read like genuine prose from a real website.</p>"),
    })
    const r = await crawlSite(SEED, {}, h.deps)
    const urls = r.pages.map((p) => p.url)
    expect(urls).toContain("https://example.com/ok")
    expect(urls).not.toContain("https://example.com/private/x")
    expect(r.pagesSkipped).toBeGreaterThan(0)
  })

  it("seeds from a sitemap when robots names one", async () => {
    const h = harness({
      "https://example.com/robots.txt": "Sitemap: https://example.com/sm.xml",
      "https://example.com/sm.xml": "<urlset><url><loc>https://example.com/deep</loc></url></urlset>",
      "https://example.com/": page("<p>Home with no links at all here, just a paragraph of ordinary prose written out at sufficient length that nobody could mistake it for an empty application shell.</p>"),
      "https://example.com/deep": page("<p>A page only reachable via the sitemap, containing more than enough ordinary words to be treated as a genuine content page by the extraction and shell detection logic.</p>"),
    })
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.pages.map((p) => p.url)).toContain("https://example.com/deep")
  })
})

describe("crawlSite — limits and failures", () => {
  it("honours the page cap", async () => {
    const site: Record<string, string> = {
      "https://example.com/robots.txt": "",
      "https://example.com/": page(
        Array.from({ length: 30 }, (_, i) => `<a href="/s${i}/p">L${i}</a>`).join("") +
        "<p>Home page with many outbound links, written at enough length to read as a genuine content page rather than an empty shell.</p>"
      ),
    }
    for (let i = 0; i < 30; i++) {
      site[`https://example.com/s${i}/p`] = page(`<p>Page number ${i} with enough words written out to count as a genuine content page here.</p>`)
    }
    const r = await crawlSite(SEED, { maxPages: 5 }, harness(site).deps)
    expect(r.pagesCrawled).toBe(5)
  })

  it("gives up after consecutive failures", async () => {
    const site: Record<string, string> = {
      "https://example.com/robots.txt": "",
      "https://example.com/": page(
        Array.from({ length: 6 }, (_, i) => `<a href="/s${i}/p">L${i}</a>`).join("") +
        "<p>Home page linking to a set of subpages that all return errors, written at enough length to read as a genuine content page.</p>"
      ),
    }
    // Every linked page fails at the transport level — the site has gone away.
    for (let i = 0; i < 6; i++) site[`https://example.com/s${i}/p`] = null as unknown as string
    const h = harness(site)
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.unreachable).toBe(true)
    expect(r.pagesFailed).toBeGreaterThanOrEqual(MAX_CONSECUTIVE_FAILURES)
    // The page that DID work is kept — a site dying after some good pages
    // should still contribute them.
    expect(r.pages.map((p) => p.url)).toContain("https://example.com/")
  })

  it("stops at the deadline and reports it", async () => {
    const site: Record<string, string> = {
      "https://example.com/robots.txt": "",
      "https://example.com/": page(
        Array.from({ length: 10 }, (_, i) => `<a href="/s${i}/p">L${i}</a>`).join("") +
        "<p>Home page with plenty of links to follow, written at enough length to read as a genuine content page rather than an empty shell.</p>"
      ),
    }
    for (let i = 0; i < 10; i++) site[`https://example.com/s${i}/p`] = page(`<p>Body number ${i} here with enough words written out to count as a genuine content page.</p>`)
    // now() jumps past the deadline after a few calls.
    const h = harness(site, { clock: [0, 0, 0, 0, 0, 999_999] })
    const r = await crawlSite(SEED, { deadlineMs: 1000 }, h.deps)
    expect(r.deadlineHit).toBe(true)
    // Whatever was gathered before the deadline is kept.
    expect(r.pagesCrawled).toBeGreaterThan(0)
  })

  it("reports an invalid seed without fetching", async () => {
    const h = harness({})
    const r = await crawlSite("not a url", {}, h.deps)
    expect(r.failure).toBe("invalid_url")
    expect(h.requested).toHaveLength(0)
  })

  it("reports site_unreachable when nothing at all was extracted", async () => {
    const h = harness({
      "https://example.com/robots.txt": "",
      "https://example.com/": undefined as unknown as string,
    })
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.pages).toHaveLength(0)
    expect(r.unreachable).toBe(false) // one failure, not three
    expect(r.failure).toBe("no_pages_extracted")
  })

  it("treats dead links as skips, not as the site being down", async () => {
    const site: Record<string, string> = {
      "https://example.com/robots.txt": "",
      "https://example.com/": page(
        Array.from({ length: 5 }, (_, i) => `<a href="/dead${i}">D${i}</a>`).join("") +
        `<a href="/live">Live</a><p>Home page with a handful of stale links alongside a good one, written at enough length to read as a genuine content page.</p>`
      ),
      // /dead0../dead4 are absent, so they 404 — a normal stale link.
      "https://example.com/live": page("<p>A page that is very much alive and carries a real paragraph of ordinary prose content for the extractor to keep.</p>", "Live"),
    }
    const r = await crawlSite(SEED, {}, harness(site).deps)
    // Five 404s in a row must not stop the crawl before it reaches /live.
    expect(r.unreachable).toBe(false)
    expect(r.pages.map((p) => p.url)).toContain("https://example.com/live")
  })

  it("reports when nothing could be extracted", async () => {
    const h = harness({ "https://example.com/robots.txt": "" })
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.failure).toBe("no_pages_extracted")
  })
})

describe("crawlSite — page-level behaviour", () => {
  it("flags a JavaScript-rendered site instead of storing shells", async () => {
    const shell = `<html><head><title>App</title></head><body><div id="root"></div></body></html>`
    const h = harness({
      "https://example.com/robots.txt": "",
      "https://example.com/": `<html><head><title>App</title></head><body><div id="root"></div>
        <a href="/a">a</a><a href="/b">b</a></body></html>`,
      "https://example.com/a": shell,
      "https://example.com/b": shell,
    })
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.jsRendered).toBe(true)
    expect(r.failure).toBe("javascript_rendered")
  })

  it("follows links from a noindex page but does not store it", async () => {
    const h = harness({
      "https://example.com/robots.txt": "",
      "https://example.com/": `<html><head><title>Index</title><meta name="robots" content="noindex"></head>
        <body><main><p>Do not index this landing page please, although it does contain more than enough ordinary words that it would otherwise qualify as a perfectly good content page.</p><a href="/real">Real</a></main></body></html>`,
      "https://example.com/real": page("<p>This is the page we actually want indexed, and it carries a decent paragraph of real prose content that comfortably clears the minimum word count for a genuine page.</p>", "Real"),
    })
    const r = await crawlSite(SEED, {}, h.deps)
    const urls = r.pages.map((p) => p.url)
    expect(urls).toContain("https://example.com/real")
    expect(urls).not.toContain("https://example.com/")
  })

  it("strips boilerplate repeated across the site", async () => {
    const withFooter = (body: string) =>
      `<html><head><title>T</title></head><body><main>${body}
        <p>Copyright 2026 Acme Ltd all rights reserved worldwide.</p></main></body></html>`
    const h = harness({
      "https://example.com/robots.txt": "",
      "https://example.com/": withFooter(`<p>Home page unique content here written at enough length to count as a real page of prose.</p>
        <a href="/a">a</a><a href="/b">b</a><a href="/c">c</a>`),
      "https://example.com/a": withFooter("<p>Page A unique content here written at enough length to count as a real page of prose.</p>"),
      "https://example.com/b": withFooter("<p>Page B unique content here written at enough length to count as a real page of prose.</p>"),
      "https://example.com/c": withFooter("<p>Page C unique content here written at enough length to count as a real page of prose.</p>"),
    })
    const r = await crawlSite(SEED, {}, h.deps)
    expect(r.pages.length).toBeGreaterThanOrEqual(3)
    for (const p of r.pages) {
      expect(p.blocks.join(" ")).not.toContain("Copyright 2026")
    }
    expect(r.droppedBoilerplate.some((b) => b.includes("Copyright 2026"))).toBe(true)
  })

  it("does not leave the site", async () => {
    const h = harness({
      "https://example.com/robots.txt": "",
      "https://example.com/": page(`<p>Home page content goes here with a sufficiently long paragraph of ordinary prose to comfortably pass the shell detection threshold used by the crawler after fetching.</p><a href="https://other.com/x">Out</a>`),
    })
    const r = await crawlSite(SEED, {}, h.deps)
    expect(h.requested).not.toContain("https://other.com/x")
  })
})
