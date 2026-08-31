import { describe, it, expect } from "vitest"
import { scoreFit, FIT_THRESHOLD } from "./fit"

const STRONG = {
  vertical: "restaurants",
  city: "Lagos",
  whatsappNumber: "+2348031234567",
  website: "https://shop.ng",
  instagram: "ovie_fabrics",
  reviewCount: 120,
  research: { hasPriceList: true, sellsInDms: true },
}

describe("scoreFit", () => {
  it("scores an ideal prospect well above the threshold", () => {
    const result = scoreFit(STRONG)
    expect(result.disqualified).toBe(false)
    expect(result.score).toBeGreaterThan(FIT_THRESHOLD)
    expect(result.reasons.length).toBeGreaterThan(4)
  })

  it("leaves a bare row below the threshold", () => {
    expect(scoreFit({}).score).toBeLessThan(FIT_THRESHOLD)
  })

  it("caps at 100 so the score stays comparable", () => {
    expect(scoreFit(STRONG).score).toBeLessThanOrEqual(100)
  })

  it("disqualifies chains before scoring them", () => {
    const result = scoreFit({ ...STRONG, research: { branchCount: 12 } })
    expect(result.disqualified).toBe(true)
    expect(result.score).toBe(0)
    expect(result.disqualifiedReason).toContain("12")
  })

  it("disqualifies businesses too large to be the buyer", () => {
    const result = scoreFit({ ...STRONG, reviewCount: 5000 })
    expect(result.disqualified).toBe(true)
    expect(result.disqualifiedReason).toContain("5000")
  })

  it("treats a published WhatsApp number as the heaviest single signal", () => {
    const withWa = scoreFit({ whatsappNumber: "+2348031234567" }).score
    const withoutWa = scoreFit({ whatsappNumber: null }).score
    expect(withWa - withoutWa).toBe(25)
  })

  it("does not reward review counts outside the owner-operated band", () => {
    expect(scoreFit({ reviewCount: 5 }).score).toBe(0)
    expect(scoreFit({ reviewCount: 900 }).score).toBe(0)
    expect(scoreFit({ reviewCount: 120 }).score).toBe(15)
  })

  it("only credits verticals that have a landing page to send them to", () => {
    expect(scoreFit({ vertical: "restaurants" }).score).toBe(15)
    expect(scoreFit({ vertical: "taxidermy" }).score).toBe(0)
  })
})
