import { describe, it, expect } from "vitest"
import { mapWithConcurrency } from "./concurrency"

describe("mapWithConcurrency", () => {
  it("preserves input order in results", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40, 50])
  })

  it("passes the correct index", async () => {
    const out = await mapWithConcurrency(["a", "b", "c"], 2, async (v, i) => `${i}:${v}`)
    expect(out).toEqual(["0:a", "1:b", "2:c"])
  })

  it("never exceeds the concurrency limit in flight", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const work = Array.from({ length: 20 }, (_, i) => i)
    await mapWithConcurrency(work, 4, async (n) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return n
    })
    expect(maxInFlight).toBeLessThanOrEqual(4)
    expect(maxInFlight).toBeGreaterThan(1) // actually ran in parallel, not serial
  })

  it("processes every item exactly once", async () => {
    const seen: number[] = []
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { seen.push(n); return n })
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([])
  })

  it("treats concurrency < 1 as serial (limit 1)", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 0, async (n) => n)
    expect(out).toEqual([1, 2, 3])
  })
})
