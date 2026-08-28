import { describe, it, expect } from "vitest"
import { detachUrlPunctuation } from "../lib/detach-url-punctuation.js"

describe("detachUrlPunctuation", () => {
  // The exact reply a customer received: the trailing "." was absorbed into the
  // link, so tapping it went nowhere.
  it("rescues a link followed by a full stop mid-sentence", () => {
    const input = "You'll find the F1 Red Ferrari Cap here: https://wa.me/c/2348149113328. Check it out!"
    expect(detachUrlPunctuation(input)).toBe(
      "You'll find the F1 Red Ferrari Cap here: https://wa.me/c/2348149113328\nCheck it out!"
    )
  })

  it("drops punctuation when the URL ends the message", () => {
    expect(detachUrlPunctuation("Order here: https://dailzero.com.")).toBe("Order here: https://dailzero.com")
  })

  it("handles the other sentence enders", () => {
    for (const p of [",", "!", "?", ";", ":"]) {
      expect(detachUrlPunctuation(`See https://dailzero.com${p} next`)).toBe("See https://dailzero.com\nnext")
    }
  })

  it("strips a run of punctuation", () => {
    expect(detachUrlPunctuation("Look https://dailzero.com... amazing")).toBe("Look https://dailzero.com\namazing")
  })

  it("leaves dots inside a URL alone", () => {
    const input = "Grab https://wa.me/c/234 and https://dailzero.com/files/spec.pdf today"
    expect(detachUrlPunctuation(input)).toBe(input)
  })

  it("leaves a URL with no trailing punctuation alone", () => {
    const input = "Visit https://dailzero.com for more"
    expect(detachUrlPunctuation(input)).toBe(input)
  })

  it("preserves an existing newline instead of adding another", () => {
    expect(detachUrlPunctuation("Here: https://dailzero.com.\nThanks")).toBe("Here: https://dailzero.com\nThanks")
  })

  it("handles www-style links", () => {
    expect(detachUrlPunctuation("Try www.dailzero.com. Thanks")).toBe("Try www.dailzero.com\nThanks")
  })

  it("fixes several links in one message", () => {
    const input = "First https://a.com. Then https://b.com, done"
    expect(detachUrlPunctuation(input)).toBe("First https://a.com\nThen https://b.com\ndone")
  })

  it("leaves text with no links untouched", () => {
    const input = "Hi there. How can I help?"
    expect(detachUrlPunctuation(input)).toBe(input)
  })
})
