import { describe, it, expect } from "vitest"
import { creditsForTokens, creditsForVoice, AI_CREDIT_COSTS, OUTPUT_WEIGHT, TOKENS_PER_CREDIT } from "./credits.js"
import { routeMessageCharge } from "./wallet.js"

describe("creditsForTokens (worker mirror)", () => {
  it("always charges at least 1 credit even on a tiny round-trip", () => {
    expect(creditsForTokens(0, 0)).toBe(1)
    expect(creditsForTokens(50, 10)).toBe(1)
  })

  it("weights output tokens at 4x the input cost (matches gpt-4o-mini ratio)", () => {
    // 1000 output tokens = 4 credits; 1000 input tokens = 1 credit.
    expect(creditsForTokens(0, TOKENS_PER_CREDIT)).toBe(OUTPUT_WEIGHT)
    expect(creditsForTokens(TOKENS_PER_CREDIT, 0)).toBe(1)
  })

  it("matches the PAYG_ANALYSIS examples", () => {
    expect(creditsForTokens(500, 150)).toBe(1)    // ~1.1 weighted, floored
    expect(creditsForTokens(500, 1500)).toBe(6)   // 6500 weighted
    expect(creditsForTokens(500, 3000)).toBe(12)  // 12500 weighted
  })

  it("ignores negative / NaN inputs", () => {
    expect(creditsForTokens(-100, -50)).toBe(1)
    expect(creditsForTokens(NaN as unknown as number, NaN as unknown as number)).toBe(1)
  })
})

describe("routeMessageCharge — billing routing decision", () => {
  it("bills to plan when the message fits inside the cycle allowance", () => {
    const d = routeMessageCharge({ creditsToCharge: 5, planLimit: 1000, used: 200, overageAllowed: false })
    expect(d.billedTo).toBe("plan")
    expect(d.needsWalletDeduction).toBe(false)
  })

  it("bills to plan when overage is allowed (Starter/Pro), even over the limit", () => {
    const d = routeMessageCharge({ creditsToCharge: 50, planLimit: 1000, used: 980, overageAllowed: true })
    expect(d.billedTo).toBe("plan")
    expect(d.needsWalletDeduction).toBe(false)
  })

  it("routes the FULL charge to wallet when plan overflows and no overage (Free/Basic)", () => {
    const d = routeMessageCharge({ creditsToCharge: 50, planLimit: 1000, used: 980, overageAllowed: false })
    expect(d.billedTo).toBe("wallet")
    expect(d.needsWalletDeduction).toBe(true)
  })

  it("unlimited plan (-1) never needs wallet", () => {
    const d = routeMessageCharge({ creditsToCharge: 99999, planLimit: -1, used: 0, overageAllowed: false })
    expect(d.billedTo).toBe("plan")
    expect(d.needsWalletDeduction).toBe(false)
  })

  it("at the exact boundary (used + charge === limit) plan covers", () => {
    const d = routeMessageCharge({ creditsToCharge: 20, planLimit: 1000, used: 980, overageAllowed: false })
    expect(d.billedTo).toBe("plan")
  })

  it("one credit past the boundary tips to wallet (when no overage)", () => {
    const d = routeMessageCharge({ creditsToCharge: 21, planLimit: 1000, used: 980, overageAllowed: false })
    expect(d.billedTo).toBe("wallet")
    expect(d.needsWalletDeduction).toBe(true)
  })
})

// Voice notes used to be transcribed for free: the worker computed this cost and
// sent it to the orchestrator as `extraCredits`, but the inbound schema never
// listed the field so zod stripped it. The worker now charges it directly, which
// makes this the amount a customer actually pays.
describe("creditsForVoice", () => {
  it("charges the per-second rate once past the minimum", () => {
    expect(creditsForVoice(6)).toBe(6 * AI_CREDIT_COSTS.voicePerSec)
    expect(creditsForVoice(30)).toBe(30 * AI_CREDIT_COSTS.voicePerSec)
  })

  it("floors at the per-note minimum for short notes", () => {
    expect(creditsForVoice(0)).toBe(AI_CREDIT_COSTS.voiceMin)
    expect(creditsForVoice(1)).toBe(AI_CREDIT_COSTS.voiceMin)
    // The break-even point: below this the minimum wins.
    const breakEven = AI_CREDIT_COSTS.voiceMin / AI_CREDIT_COSTS.voicePerSec
    expect(creditsForVoice(breakEven)).toBe(AI_CREDIT_COSTS.voiceMin)
  })

  it("rounds a partial second up, never down", () => {
    expect(creditsForVoice(10.1)).toBe(11 * AI_CREDIT_COSTS.voicePerSec)
  })

  it("never returns a chargeable-but-zero amount", () => {
    for (const d of [0, 0.4, 1, 7, 60]) expect(creditsForVoice(d)).toBeGreaterThan(0)
  })
})
