import { describe, it, expect } from "vitest"
import { htmlToText, wordCount } from "./html-to-text.js"

const URL_ = "https://example.com/about"
const page = (body: string, head = "") =>
  `<html><head><title>Acme — About</title>${head}</head><body>${body}</body></html>`

describe("htmlToText — content", () => {
  it("keeps headings, paragraphs and list items with their structure", () => {
    const r = htmlToText(page(`
      <main>
        <h1>Opening hours</h1>
        <p>We are open Monday to Friday, nine until six.</p>
        <h2>Weekend</h2>
        <ul><li>Saturday nine until four</li><li>Sunday closed all day</li></ul>
      </main>`), URL_)
    expect(r.blocks).toContain("# Opening hours")
    expect(r.blocks).toContain("## Weekend")
    expect(r.blocks).toContain("- Saturday nine until four")
    expect(r.blocks.some((b) => b.includes("Monday to Friday"))).toBe(true)
  })

  it("reads the title, falling back to h1", () => {
    expect(htmlToText(page("<h1>x</h1>"), URL_).title).toBe("Acme — About")
    expect(htmlToText("<html><body><h1>Just a heading</h1></body></html>", URL_).title).toBe("Just a heading")
  })

  it("prefers main over the whole body", () => {
    const r = htmlToText(page(`
      <div><p>Chrome text that should lose to main content below here.</p></div>
      <main><p>The real content of this page lives here in main.</p></main>`), URL_)
    expect(r.blocks.join(" ")).toContain("real content")
    expect(r.blocks.join(" ")).not.toContain("Chrome text")
  })

  it("decodes entities", () => {
    const r = htmlToText(page("<main><p>Fish &amp; chips cost &pound;10 today</p></main>"), URL_)
    expect(r.blocks.join(" ")).toContain("Fish & chips")
  })
})

describe("htmlToText — stripping", () => {
  it("never leaks script or style contents", () => {
    const r = htmlToText(page(`
      <main><p>Visible paragraph text here.</p></main>
      <script>var secret = "SHOULD_NOT_APPEAR";</script>
      <style>.x { color: SHOULD_NOT_APPEAR }</style>`), URL_)
    expect(r.blocks.join(" ")).not.toContain("SHOULD_NOT_APPEAR")
  })

  it("removes nav, header, footer and aside", () => {
    const r = htmlToText(page(`
      <nav><p>Home About Contact navigation</p></nav>
      <header><p>Site header tagline here</p></header>
      <main><p>Actual page content worth indexing.</p></main>
      <aside><p>Sidebar promotional content</p></aside>
      <footer><p>Copyright notice and address</p></footer>`), URL_)
    const text = r.blocks.join(" ")
    expect(text).toContain("Actual page content")
    for (const gone of ["navigation", "tagline", "Sidebar", "Copyright"]) {
      expect(text).not.toContain(gone)
    }
  })

  it("removes cookie and newsletter blocks by class or id", () => {
    const r = htmlToText(page(`
      <div class="cookie-banner"><p>We use cookies to improve your experience</p></div>
      <div id="newsletter-signup"><p>Subscribe to our mailing list today</p></div>
      <main><p>Genuine content that must survive the filter.</p></main>`), URL_)
    const text = r.blocks.join(" ")
    expect(text).toContain("Genuine content")
    expect(text).not.toContain("cookies")
    expect(text).not.toContain("Subscribe")
  })

  it("drops very short non-heading blocks but keeps short headings", () => {
    const r = htmlToText(page(`<main><h2>Hours</h2><p>OK</p><p>A real sentence of content here.</p></main>`), URL_)
    expect(r.blocks).toContain("## Hours")
    expect(r.blocks).not.toContain("OK")
  })
})

describe("htmlToText — regressions from review", () => {
  // The whole point of the feature for a restaurant agent: a class of "menu"
  // is the content, not chrome.
  it("keeps a section whose class contains 'menu'", () => {
    const r = htmlToText(page(`
      <main><div class="menu-items">
        <h2>Pizza</h2><p>Margherita costs nine thousand naira for a regular size.</p>
      </div></main>`), URL_)
    expect(r.blocks.join(" ")).toContain("Margherita")
    expect(r.blocks).toContain("## Pizza")
  })

  it("keeps related products and promotional copy", () => {
    const r = htmlToText(page(`
      <main>
        <div class="related-products"><p>Customers also buy our ankara fabric bundles.</p></div>
        <div class="promo"><p>Free delivery on orders above fifty thousand naira.</p></div>
      </main>`), URL_)
    expect(r.blocks.join(" ")).toContain("ankara fabric")
    expect(r.blocks.join(" ")).toContain("Free delivery")
  })

  // find() matches ancestors and descendants, so nested blocks emitted twice.
  it("does not emit nested block text twice", () => {
    const r = htmlToText(page(`<main><ul><li><p>Open until seven on Saturdays</p></li></ul></main>`), URL_)
    const hits = r.blocks.filter((b) => b.includes("Open until seven")).length
    expect(hits).toBe(1)
  })

  it("still strips genuine chrome", () => {
    const r = htmlToText(page(`
      <div class="cookie-consent"><p>We use cookies on this website</p></div>
      <div class="navbar"><p>Home Shop Contact</p></div>
      <main><p>Real content that must survive the filtering step.</p></main>`), URL_)
    const text = r.blocks.join(" ")
    expect(text).toContain("Real content")
    expect(text).not.toContain("cookies")
    expect(text).not.toContain("Home Shop")
  })
})

describe("htmlToText — links and meta", () => {
  it("resolves links to absolute, including from nav", () => {
    const r = htmlToText(page(`
      <nav><a href="/pricing">Pricing</a></nav>
      <main><a href="contact">Contact</a><a href="https://other.com/x">Other</a></main>`), URL_)
    expect(r.links).toContain("https://example.com/pricing")
    expect(r.links).toContain("https://example.com/contact")
    expect(r.links).toContain("https://other.com/x")
  })

  it("skips rel=nofollow links", () => {
    const r = htmlToText(page(`<main><a href="/a" rel="nofollow">no</a><a href="/b">yes</a></main>`), URL_)
    expect(r.links).not.toContain("https://example.com/a")
    expect(r.links).toContain("https://example.com/b")
  })

  it("reads canonical and robots meta", () => {
    const r = htmlToText(
      page("<main><p>Some content on this page.</p></main>",
        `<link rel="canonical" href="https://example.com/canonical"><meta name="robots" content="noindex, nofollow">`),
      URL_
    )
    expect(r.canonical).toBe("https://example.com/canonical")
    expect(r.noindex).toBe(true)
    expect(r.nofollow).toBe(true)
  })
})

describe("htmlToText — the JS-rendered case", () => {
  // A React shell has no text. We must be able to detect this and say so,
  // rather than silently indexing an empty page.
  it("yields almost no words for an empty app shell", () => {
    const r = htmlToText(page(`<div id="root"></div><script>window.__DATA__={}</script>`), URL_)
    expect(wordCount(r.blocks)).toBeLessThan(5)
  })

  it("counts words for a real page", () => {
    const r = htmlToText(page("<main><p>One two three four five six seven eight.</p></main>"), URL_)
    expect(wordCount(r.blocks)).toBeGreaterThanOrEqual(8)
  })
})
