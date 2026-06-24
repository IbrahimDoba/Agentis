import { describe, it, expect } from "vitest"
import { isSubscriptionCharge } from "@/app/api/paystack/webhook/route"
import { newPaystackReference, newSubscriptionReference } from "@/lib/paystack"

// Proves the unified Paystack webhook routes credit top-ups vs subscription
// charges correctly — using the REAL reference generators each flow uses. This
// is the safety net for pointing one Paystack webhook URL at both flows.

describe("isSubscriptionCharge — unified webhook routing", () => {
  it("classifies credit top-up references as NOT subscription", () => {
    for (let i = 0; i < 200; i++) {
      const ref = newPaystackReference() // DZ_<ts>_<rand>
      expect(isSubscriptionCharge(ref, undefined)).toBe(false)
    }
  })

  it("classifies subscription references as subscription", () => {
    for (let i = 0; i < 200; i++) {
      const ref = newSubscriptionReference() // DZ_SUB_<ts>_<rand>
      expect(isSubscriptionCharge(ref, undefined)).toBe(true)
    }
  })

  it("routes by metadata.purpose even if the prefix were absent", () => {
    expect(isSubscriptionCharge("DZ_anything", "subscription")).toBe(true)
  })

  it("a credit charge with credit metadata stays on the credit path", () => {
    const ref = newPaystackReference()
    // credits metadata has no `purpose`
    expect(isSubscriptionCharge(ref, undefined)).toBe(false)
  })

  it("generators never collide on the DZ_SUB_ prefix", () => {
    // A credit ref must never accidentally start with DZ_SUB_.
    for (let i = 0; i < 1000; i++) {
      expect(newPaystackReference().startsWith("DZ_SUB_")).toBe(false)
    }
  })
})
