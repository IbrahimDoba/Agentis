import { describe, it, expect } from "vitest"
import { computeSummary, toBase, type FinanceEntryDTO } from "./finance"

// Pure-logic tests for the admin finance P&L math. No DB — computeSummary/toBase
// are isomorphic helpers, so this just pins the arithmetic and FX handling.

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString()

function entry(p: Partial<FinanceEntryDTO> & Pick<FinanceEntryDTO, "kind" | "amount">): FinanceEntryDTO {
  return {
    id: Math.random().toString(36).slice(2),
    label: "x",
    currency: "NGN",
    recurring: true,
    note: null,
    incurredAt: iso(2026, 7, 1),
    ...p,
  }
}

describe("toBase", () => {
  it("returns the amount unchanged for the base currency", () => {
    expect(toBase(5000, "NGN", {})).toBe(5000)
  })
  it("converts via the rate map", () => {
    expect(toBase(10, "USD", { USD: 1600 })).toBe(16000)
  })
  it("returns null when a non-base currency has no rate", () => {
    expect(toBase(10, "USD", {})).toBeNull()
    expect(toBase(10, "USD", { USD: 0 })).toBeNull()
  })
})

describe("computeSummary", () => {
  const now = new Date(Date.UTC(2026, 6, 15)) // July 2026

  it("computes profit, recurring, and monthly totals in the NGN base", () => {
    const entries = [
      entry({ kind: "revenue", amount: 500000, recurring: true }),          // recurring revenue
      entry({ kind: "revenue", amount: 200000, recurring: false, incurredAt: iso(2026, 7, 10) }), // one-off this month
      entry({ kind: "expense", amount: 100000, recurring: true }),          // recurring expense
      entry({ kind: "expense", amount: 30000, recurring: false, incurredAt: iso(2026, 7, 5) }),   // one-off this month
      entry({ kind: "expense", amount: 90000, recurring: false, incurredAt: iso(2026, 5, 5) }),   // one-off PAST month
    ]
    const s = computeSummary(entries, {}, now)

    expect(s.totalRevenue).toBe(700000)
    expect(s.recurringRevenue).toBe(500000)
    expect(s.totalExpenses).toBe(220000)                 // 100k + 30k + 90k
    expect(s.recurringExpenses).toBe(100000)
    expect(s.profitSoFar).toBe(480000)                   // 700k - 220k
    expect(s.recurringProfit).toBe(400000)               // 500k - 100k
    expect(s.monthlyExpenses).toBe(130000)               // recurring 100k + this-month one-off 30k (NOT the May 90k)
  })

  it("converts foreign-currency entries and flags ones with no rate", () => {
    const entries = [
      entry({ kind: "expense", amount: 20, currency: "USD", recurring: true }),   // needs rate
      entry({ kind: "expense", amount: 5000, currency: "NGN", recurring: true }),
    ]
    const withRate = computeSummary(entries, { USD: 1600 }, now)
    expect(withRate.recurringExpenses).toBe(37000)       // 20*1600 + 5000
    expect(withRate.unconverted.count).toBe(0)

    const noRate = computeSummary(entries, {}, now)
    expect(noRate.recurringExpenses).toBe(5000)          // USD row excluded
    expect(noRate.unconverted.count).toBe(1)
    expect(noRate.unconverted.currencies).toEqual(["USD"])
  })
})
