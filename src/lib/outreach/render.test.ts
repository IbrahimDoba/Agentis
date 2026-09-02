import { describe, it, expect } from "vitest"
import { renderOutreachEmail } from "./render"

const base = {
  subject: "Question about your WhatsApp enquiries",
  body: "Two lines of real copy.\n\nhttps://www.dailzero.com/r/abc",
  signOff: "Ibrahim Doba\nDailzero, Lagos",
  token: "abc",
}

describe("renderOutreachEmail", () => {
  it("sends text only by default", () => {
    // An HTML multipart alongside List-Unsubscribe reads as a campaign to
    // Gmail's classifier, which is how the first seed test landed in
    // Promotions. Text-only is the default for exactly that reason.
    expect(renderOutreachEmail(base).html).toBeNull()
  })

  it("still builds an HTML part when explicitly asked", () => {
    const html = renderOutreachEmail({ ...base, htmlPart: true }).html
    expect(html).toContain("<p")
    expect(html).toContain("Ibrahim Doba")
  })

  it("reflows soft-wrapped source into one paragraph", () => {
    // Copy is wrapped for legibility while writing it; honouring those breaks as
    // <br> gave ragged half-width lines in the client.
    const html = renderOutreachEmail({
      ...base,
      body: "one line\nwrapped here\n\nsecond para",
      htmlPart: true,
    }).html!
    expect(html).toContain("one line wrapped here")
    expect(html).not.toContain("<br>")
    // Body paragraphs only; the unsubscribe line is also a <p>.
    expect((html.match(/<p style="margin:0 0 20px/g) ?? []).length).toBe(2)
  })

  it("renders a labelled link as an anchor in HTML", () => {
    const html = renderOutreachEmail({
      ...base,
      body: "Ask us here: [Message us on WhatsApp](https://wa.me/234816)",
      htmlPart: true,
    }).html!
    expect(html).toContain('<a href="https://wa.me/234816"')
    expect(html).toContain(">Message us on WhatsApp</a>")
    // The bare-URL pass must not re-link the href it just produced.
    expect(html).not.toContain('href="<a')
  })

  it("keeps the destination visible in the text part", () => {
    // A hyperlink hiding its target is the shape of a phishing mail, so the
    // plain-text alternative always spells the URL out.
    const { text } = renderOutreachEmail({
      ...base,
      body: "[Message us on WhatsApp](https://wa.me/234816)",
    })
    expect(text).toContain("Message us on WhatsApp: https://wa.me/234816")
  })

  it("carries both RFC 8058 headers", () => {
    const { headers } = renderOutreachEmail(base)
    expect(headers["List-Unsubscribe"]).toContain("/u/abc")
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })

  it("puts the opt-out in the text body, not only in a header", () => {
    // Nigerian SMB owners trust a sentence more than a mail-client button, and
    // an unsubscribe is always cheaper than a spam complaint.
    expect(renderOutreachEmail(base).text).toContain("Not interested?")
  })

  it("keeps the sign-off out of the validated body", () => {
    const { text } = renderOutreachEmail(base)
    expect(text).toContain("Ibrahim Doba")
    expect(text.indexOf("Ibrahim Doba")).toBeGreaterThan(text.indexOf("real copy"))
  })
})
