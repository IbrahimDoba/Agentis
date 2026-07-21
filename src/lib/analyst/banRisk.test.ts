import { describe, it, expect } from "vitest"
import { scoreBanRisk, messageSimilarity, type BanRiskInput } from "./banRisk"

const quiet: BanRiskInput = {
  broadcasts14d: [],
  followupSent14d: 0,
  coldFirstConversations7d: 0,
  youngestSessionAgeDays: 120,
  warmupTier: 4,
  disconnects48h: 2,
  priorBans: 0,
}

describe("scoreBanRisk", () => {
  it("quiet, well-behaved account → low", () => {
    const r = scoreBanRisk(quiet)
    expect(r.level).toBe("low")
    expect(r.score).toBe(0)
    expect(r.reasons).toEqual([])
  })

  it("the Skavala profile → high (volume + invite links + near-identical + fresh T4 link)", () => {
    const msg = "Hi {name}! Have you joined our WhatsApp group yet? https://chat.whatsapp.com/ABC123"
    const r = scoreBanRisk({
      broadcasts14d: [
        { recipients: 896, message: msg, failedRatio: 0.05, daysAgo: 5 },
        { recipients: 150, message: msg.replace("ABC123", "XYZ789"), failedRatio: 0, daysAgo: 9 },
      ],
      followupSent14d: 492,
      coldFirstConversations7d: 127,
      youngestSessionAgeDays: 3,
      warmupTier: 4,
      disconnects48h: 14,
      priorBans: 0,
    })
    expect(r.level).toBe("high")
    expect(r.score).toBeGreaterThanOrEqual(6)
    expect(r.reasons.join(" ")).toMatch(/invite links/i)
    expect(r.reasons.join(" ")).toMatch(/near-identical/i)
  })

  it("moderate broadcasting alone → elevated at most", () => {
    const r = scoreBanRisk({
      ...quiet,
      broadcasts14d: [{ recipients: 350, message: "New arrivals this week — come check them out!", failedRatio: 0.01, daysAgo: 2 }],
    })
    expect(r.level).toBe("low") // volume 350 alone = +2 → still low boundary
    expect(r.score).toBe(2)
  })

  it("prior ban tips an otherwise-borderline account over", () => {
    const r = scoreBanRisk({
      ...quiet,
      broadcasts14d: [{ recipients: 400, message: "Promo!", failedRatio: 0, daysAgo: 1 }],
      priorBans: 1,
    })
    expect(r.score).toBe(4)
    expect(r.level).toBe("elevated")
  })

  it("no linked session (null age) never triggers the fresh-link rule", () => {
    const r = scoreBanRisk({ ...quiet, youngestSessionAgeDays: null, warmupTier: null })
    expect(r.score).toBe(0)
  })
})

describe("messageSimilarity", () => {
  it("near-identical broadcast texts score high", () => {
    const a = "Hi {name}! Have you joined our WhatsApp group? Tap here to join now"
    const b = "Hi {name}, Have you joined our WhatsApp group? Tap here to join today"
    expect(messageSimilarity(a, b)).toBeGreaterThan(0.8)
  })
  it("different messages score low", () => {
    expect(messageSimilarity("New stock of solar fans arrived", "Your order has been shipped, track it here")).toBeLessThan(0.3)
  })
})
