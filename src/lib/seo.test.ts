import { describe, it, expect } from "vitest"
import { PLAN_PRICES, formatNaira } from "./plans"
import {
  HOME_FAQS, SITE_DESCRIPTION, SITE_URL, absoluteUrl, homeJsonLd, metaDescription, pageMetadata, planSummaries,
} from "./seo"

describe("seo", () => {
  it("quotes plan prices from the billing constants", () => {
    const text = planSummaries().join(" ")
    for (const plan of ["basic", "starter", "pro"]) {
      expect(text).toContain(formatNaira(PLAN_PRICES[plan]))
    }
    // The fixed strings name the entry price by hand; fail if it moves.
    expect(SITE_DESCRIPTION).toContain(formatNaira(PLAN_PRICES.basic))
  })

  it("puts every page on the one canonical host", () => {
    expect(absoluteUrl("/")).toBe(`${SITE_URL}/`)
    expect(absoluteUrl("pricing")).toBe(`${SITE_URL}/pricing`)
    const meta = pageMetadata({ title: "Pricing", description: "d", path: "/pricing" })
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/pricing`)
    expect(meta.title).toBe("Pricing | Dailzero")
  })

  it("keeps descriptions short enough to be shown whole", () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160)
    const long = "Nigerian fintechs are growing fast. " + "Customers want answers immediately and waiting is costly ".repeat(6)
    const out = metaDescription(long)
    expect(out.length).toBeLessThanOrEqual(160)
    expect(out).not.toMatch(/\s$/)
    expect(metaDescription("Short one.")).toBe("Short one.")
  })

  it("emits one FAQ entry per visible question", () => {
    const faq = homeJsonLd()["@graph"].find((n) => (n as { "@type": string })["@type"] === "FAQPage") as { mainEntity: unknown[] }
    expect(faq.mainEntity).toHaveLength(HOME_FAQS.length)
  })
})
