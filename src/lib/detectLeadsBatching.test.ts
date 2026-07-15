import { describe, it, expect } from "vitest"
import { estimateTokens, batchByTokenBudget, type LeadConvEntry } from "./detectLeadsBatching"

const entry = (id: string, chars: number): LeadConvEntry => ({ conversationId: id, text: "x".repeat(chars) })

describe("estimateTokens", () => {
  it("approximates ~4 chars per token, rounding up", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcde")).toBe(2)
  })
})

describe("batchByTokenBudget", () => {
  it("returns no batches for an empty list", () => {
    expect(batchByTokenBudget([], 1000)).toEqual([])
  })

  it("keeps everything in one batch when under budget", () => {
    const entries = [entry("a", 400), entry("b", 400)] // ~100 tokens each
    const batches = batchByTokenBudget(entries, 1000)
    expect(batches).toHaveLength(1)
    expect(batches[0].map((e) => e.conversationId)).toEqual(["a", "b"])
  })

  it("splits into multiple batches when the budget is exceeded", () => {
    // 4 entries of ~250 tokens each, budget 600 → 2 per batch
    const entries = [entry("a", 1000), entry("b", 1000), entry("c", 1000), entry("d", 1000)]
    const batches = batchByTokenBudget(entries, 600)
    expect(batches).toHaveLength(2)
    expect(batches[0].map((e) => e.conversationId)).toEqual(["a", "b"])
    expect(batches[1].map((e) => e.conversationId)).toEqual(["c", "d"])
  })

  it("never drops an oversized entry — it gets its own batch", () => {
    const entries = [entry("small", 40), entry("huge", 100_000), entry("small2", 40)]
    const batches = batchByTokenBudget(entries, 500)
    const flat = batches.flat().map((e) => e.conversationId)
    expect(flat.sort()).toEqual(["huge", "small", "small2"])
    // the huge one is isolated
    expect(batches.some((b) => b.length === 1 && b[0].conversationId === "huge")).toBe(true)
  })

  it("preserves order and covers every entry exactly once", () => {
    const entries = Array.from({ length: 50 }, (_, i) => entry(`c${i}`, 800)) // ~200 tokens each
    const batches = batchByTokenBudget(entries, 1000) // ~5 per batch
    const flat = batches.flat().map((e) => e.conversationId)
    expect(flat).toEqual(entries.map((e) => e.conversationId))
    expect(batches.every((b) => b.length > 0)).toBe(true)
  })
})
