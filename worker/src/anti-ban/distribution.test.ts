import { describe, it, expect } from "vitest"
import { truncatedNormal } from "./distribution.js"

describe("truncatedNormal", () => {
  it("always returns a value within [min, max]", () => {
    for (let i = 0; i < 1000; i++) {
      const v = truncatedNormal(5000, 15000)
      expect(v).toBeGreaterThanOrEqual(5000)
      expect(v).toBeLessThanOrEqual(15000)
    }
  })

  it("clusters around the midpoint", () => {
    const samples = Array.from({ length: 10000 }, () => truncatedNormal(0, 100))
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    // Mean should be close to 50 (midpoint)
    expect(mean).toBeGreaterThan(40)
    expect(mean).toBeLessThan(60)
  })

  it("returns integers", () => {
    for (let i = 0; i < 100; i++) {
      expect(Number.isInteger(truncatedNormal(1000, 5000))).toBe(true)
    }
  })
})
