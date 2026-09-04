import { describe, it, expect } from "vitest"
import { AI_CREDIT_COSTS as APP_COSTS, creditsForMessageType as appCost } from "./plans"
import { AI_CREDIT_COSTS as WORKER_COSTS, creditsForMessageType as workerCost } from "../../worker/src/billing/credits"

// The three packages cannot import each other at runtime — different module
// resolution, different zod majors, no workspace deps — so billing constants are
// hand-mirrored and carry "keep in sync" comments. Those comments did not hold:
// the worker priced video and document, the app copy had neither.
//
// A test can cross the boundary even though the build cannot, so the comment
// becomes a check. Root tsconfig already type-checks worker sources, and this
// module is a leaf with no imports, so pulling it in costs nothing.
describe("AI_CREDIT_COSTS parity (app vs worker)", () => {
  it("prices exactly the same set of message kinds", () => {
    expect(Object.keys(APP_COSTS).sort()).toEqual(Object.keys(WORKER_COSTS).sort())
  })

  it("agrees on every price", () => {
    expect(APP_COSTS).toEqual(WORKER_COSTS)
  })

  it("prices the four billable message types the worker can charge for", () => {
    // MessageBillingType in worker/src/billing/credits.ts.
    for (const kind of ["text", "image", "video", "document"] as const) {
      expect(APP_COSTS[kind]).toBeGreaterThan(0)
    }
  })

  it("charges a voice minimum worth at least one second", () => {
    expect(APP_COSTS.voiceMin).toBeGreaterThanOrEqual(APP_COSTS.voicePerSec)
  })

  it("prices every message type the same as the worker does", () => {
    // The worker charges and writes the ledger row; the app copy reports the
    // number back to the developer on /v1/messages. If these ever disagree, the
    // API lies about what it just spent.
    for (const t of ["text", "image", "video", "document"] as const) {
      expect(appCost(t)).toBe(workerCost(t))
    }
  })

  it("falls back to the text rate for an unknown type, on both sides", () => {
    expect(appCost(undefined)).toBe(workerCost(undefined))
    expect(appCost(undefined)).toBe(APP_COSTS.text)
  })
})
