import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import { verifyWebhookSignature, newPaystackReference, estimatePaystackFee } from "./paystack"

function signWith(secret: string, body: string): string {
  return createHmac("sha512", secret).update(body, "utf8").digest("hex")
}

describe("verifyWebhookSignature", () => {
  const SECRET = "sk_test_vitest_secret"
  const BODY = JSON.stringify({ event: "charge.success", data: { reference: "ref_x" } })

  it("accepts a correctly signed body", () => {
    const sig = signWith(SECRET, BODY)
    expect(verifyWebhookSignature(BODY, sig, SECRET)).toBe(true)
  })

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false)
    expect(verifyWebhookSignature(BODY, "", SECRET)).toBe(false)
  })

  it("rejects a signature computed with the wrong secret", () => {
    const wrong = signWith("sk_test_someone_else", BODY)
    expect(verifyWebhookSignature(BODY, wrong, SECRET)).toBe(false)
  })

  it("rejects a signature for a tampered body (single bit flip)", () => {
    const sig = signWith(SECRET, BODY)
    const tampered = BODY.replace("ref_x", "ref_y")
    expect(verifyWebhookSignature(tampered, sig, SECRET)).toBe(false)
  })

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifyWebhookSignature(BODY, "deadbeef", SECRET)).toBe(false)
  })

  it("rejects malformed hex without throwing", () => {
    const sig = signWith(SECRET, BODY)
    // Replace a char with one outside 0-9a-f to break hex parsing.
    const broken = "z" + sig.slice(1)
    expect(verifyWebhookSignature(broken, broken, SECRET)).toBe(false)
  })
})

describe("estimatePaystackFee — current Nigeria local pricing", () => {
  it("zero or negative amount → zero fee", () => {
    expect(estimatePaystackFee(0)).toBe(0)
    expect(estimatePaystackFee(-500)).toBe(0)
  })

  it("waives the ₦100 flat fee below ₦2,500 (1.5% only)", () => {
    expect(estimatePaystackFee(1000)).toBe(15)
    expect(estimatePaystackFee(2000)).toBe(30)
    // boundary just under 2500
    expect(estimatePaystackFee(2499)).toBe(37)
  })

  it("adds ₦100 flat fee at ₦2,500 and above", () => {
    expect(estimatePaystackFee(2500)).toBe(100 + 38) // round(37.5) = 38
    expect(estimatePaystackFee(5000)).toBe(100 + 75)
    expect(estimatePaystackFee(20000)).toBe(100 + 300)
  })

  it("caps the total fee at ₦2,000", () => {
    expect(estimatePaystackFee(200000)).toBe(2000)
    expect(estimatePaystackFee(500000)).toBe(2000)
    // Test the exact crossover: fee = 100 + amount*0.015 → caps when ≥ 1900/0.015 ≈ 126,667
    expect(estimatePaystackFee(126_667)).toBe(2000)
  })
})

describe("newPaystackReference", () => {
  it("starts with the DZ_ prefix", () => {
    expect(newPaystackReference().startsWith("DZ_")).toBe(true)
  })

  it("returns different references each call", () => {
    const a = newPaystackReference()
    const b = newPaystackReference()
    expect(a).not.toBe(b)
  })

  it("has a reasonable length (≤ 50 chars — Paystack max is 100)", () => {
    expect(newPaystackReference().length).toBeLessThanOrEqual(50)
  })
})
