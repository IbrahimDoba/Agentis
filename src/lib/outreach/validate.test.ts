import { describe, it, expect } from "vitest"
import { validateCopy, countWords, findBannedPhrases, type GeneratedCopy, type ValidationContext } from "./validate"

const DEMO_URL = "https://www.dailzero.com/demo/ovie-fabrics"

const CTX: ValidationContext = {
  fetchedHosts: ["oviefabrics.ng", "instagram.com"],
  sourceLabel: "your Instagram bio",
  demoUrl: DEMO_URL,
}

const GOOD: GeneratedCopy = {
  subject: "your whatsapp line",
  body: [
    "Two of your Google reviews mention nobody answering. Not a dig, that is just what",
    "happens when enquiries land at 9pm and you are asleep.",
    "",
    "I built you something. An AI agent loaded with your fabric range that answers",
    "WhatsApp in under two seconds and flags anyone serious. Talk to it here:",
    DEMO_URL,
    "",
    "Found you through your Instagram bio. Reply stop and I will not write again.",
  ].join("\n"),
  sourceDisclosure: "Found you through your Instagram bio.",
  observedSignals: [
    { claim: "reviews mention no reply", sourceUrl: "https://oviefabrics.ng/contact" },
    { claim: "sells fabric by the yard", sourceUrl: "https://www.instagram.com/ovie_fabrics" },
  ],
}

function fail(copy: Partial<GeneratedCopy>, ctx: Partial<ValidationContext> = {}) {
  const result = validateCopy({ ...GOOD, ...copy }, { ...CTX, ...ctx })
  expect(result.ok).toBe(false)
  return result.ok ? [] : result.failures
}

describe("validateCopy", () => {
  it("passes well-formed copy", () => {
    expect(validateCopy(GOOD, CTX)).toEqual({ ok: true })
  })

  it("rejects a body that runs long", () => {
    const failures = fail({ body: `${DEMO_URL} ` + "word ".repeat(140) })
    expect(failures.some((f) => f.includes("max 130"))).toBe(true)
  })

  it("rejects a body with no link and a body with two", () => {
    expect(fail({ body: "Short note with no link at all but enough words to clear the floor here ok" }).join()).toContain("no demo link")
    expect(fail({ body: `${GOOD.body}\nAlso see https://oviefabrics.ng` }).join()).toContain("2 links")
  })

  it("rejects a link that is not the demo", () => {
    expect(fail({ body: GOOD.body.replace(DEMO_URL, "https://dailzero.com/pricing") }).join()).toContain(
      "somewhere other than the demo"
    )
  })

  it("catches template openers", () => {
    expect(fail({ body: GOOD.body.replace("Two of your", "I came across your shop. Two of your") }).join()).toContain(
      "banned phrasing"
    )
  })

  it("catches em dashes", () => {
    expect(fail({ body: GOOD.body.replace("Not a dig,", "Not a dig —") }).join()).toContain("em or en dash")
  })

  it("rejects a subject that fakes a reply", () => {
    expect(fail({ subject: "Re: your whatsapp line" }).join()).toContain("fakes a reply")
  })

  it("rejects a shouty or overlong subject", () => {
    expect(fail({ subject: "YOUR whatsapp line" }).join()).toContain("shouty")
    expect(fail({ subject: "a".repeat(56) }).join()).toContain("max 55")
  })

  it("rejects a signal citing a host we never fetched", () => {
    const failures = fail({
      observedSignals: [{ claim: "invented", sourceUrl: "https://somewhere-else.com/x" }],
    })
    expect(failures.join()).toContain("somewhere-else.com, which we never fetched")
  })

  it("treats the www prefix as the same host", () => {
    expect(validateCopy(GOOD, { ...CTX, fetchedHosts: ["www.oviefabrics.ng", "www.instagram.com"] })).toEqual({ ok: true })
  })

  it("requires at least one observed signal", () => {
    expect(fail({ observedSignals: [] }).join()).toContain("no observed signal")
  })

  it("requires the disclosure to name the recorded source", () => {
    expect(fail({ sourceDisclosure: "Found you online." }).join()).toContain("your Instagram bio")
  })

  it("reports every failure at once so review is one pass", () => {
    const failures = fail({ subject: "RE: HELLO", body: "too short", observedSignals: [] })
    expect(failures.length).toBeGreaterThan(3)
  })
})

describe("countWords / findBannedPhrases", () => {
  it("counts words, not whitespace", () => {
    expect(countWords("  one   two\nthree ")).toBe(3)
    expect(countWords("   ")).toBe(0)
  })

  it("matches banned phrasing case-insensitively", () => {
    expect(findBannedPhrases("I Hope This Finds You Well")).toHaveLength(1)
    expect(findBannedPhrases("a normal sentence")).toHaveLength(0)
  })
})
