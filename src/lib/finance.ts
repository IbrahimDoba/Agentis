import { formatNaira } from "@/lib/plans"

// Admin finance tab: pure helpers for the manual expense/revenue P&L. NO db /
// server imports here — this module is shared by the server page and the client
// dashboard, so it must stay isomorphic.

// Base currency for all combined totals. Everything converts to this via the
// editable FinanceFxRate table (1 unit of X = rateToBase NGN). NGN itself is
// rate 1, implicit.
export const BASE_CURRENCY = "NGN"

// Offered in the currency dropdowns. `currency` is a free-text ISO code in the
// DB, so this list is just a convenience — not a hard constraint.
export const COMMON_CURRENCIES = ["NGN", "USD", "EUR", "GBP"] as const

export type FinanceKind = "expense" | "revenue"

export interface FinanceEntryDTO {
  id: string
  kind: FinanceKind
  label: string
  amount: number
  currency: string
  recurring: boolean
  note: string | null
  incurredAt: string // ISO
}

// currency code -> NGN per 1 unit. NGN is always 1.
export type RateMap = Record<string, number>

/**
 * Convert an amount in `currency` to the NGN base. Returns null when we have no
 * rate for a non-base currency, so callers can flag "needs an FX rate" instead
 * of silently dropping or mis-summing it.
 */
export function toBase(amount: number, currency: string, rates: RateMap): number | null {
  if (currency === BASE_CURRENCY) return amount
  const rate = rates[currency]
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null
  return amount * rate
}

/** Format an amount in its own currency (base uses the ₦ helper). */
export function formatMoney(amount: number, currency: string): string {
  if (currency === BASE_CURRENCY) return formatNaira(Math.round(amount))
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

/** Format a base-currency (NGN) figure. */
export function formatBase(amount: number): string {
  return formatNaira(Math.round(amount))
}

function sameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso)
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()
}

export interface FinanceSummary {
  // All figures below are in the NGN base currency.
  totalRevenue: number       // every revenue entry, all-time
  totalExpenses: number      // every expense entry, all-time
  profitSoFar: number        // totalRevenue - totalExpenses
  recurringRevenue: number   // revenue entries flagged recurring (monthly run-rate)
  recurringExpenses: number  // expense entries flagged recurring (monthly run-rate)
  recurringProfit: number    // recurringRevenue - recurringExpenses
  monthlyExpenses: number    // recurring expenses + this-month one-off expenses
  // Rows we couldn't convert (missing FX rate) — surfaced so totals aren't
  // silently understated.
  unconverted: { currencies: string[]; count: number }
}

/**
 * Compute the P&L summary from raw entries + FX rates, all in the NGN base.
 * Entries in a currency with no rate are excluded from the base totals and
 * reported under `unconverted` so the UI can prompt for a rate.
 */
export function computeSummary(entries: FinanceEntryDTO[], rates: RateMap, now: Date = new Date()): FinanceSummary {
  let totalRevenue = 0, totalExpenses = 0, recurringRevenue = 0, recurringExpenses = 0, monthlyExpenses = 0
  const unconvertedCurrencies = new Set<string>()
  let unconvertedCount = 0

  for (const e of entries) {
    const base = toBase(e.amount, e.currency, rates)
    if (base === null) {
      unconvertedCurrencies.add(e.currency)
      unconvertedCount++
      continue
    }
    if (e.kind === "revenue") {
      totalRevenue += base
      if (e.recurring) recurringRevenue += base
    } else {
      totalExpenses += base
      if (e.recurring) {
        recurringExpenses += base
        monthlyExpenses += base
      } else if (sameMonth(e.incurredAt, now)) {
        monthlyExpenses += base
      }
    }
  }

  return {
    totalRevenue,
    totalExpenses,
    profitSoFar: totalRevenue - totalExpenses,
    recurringRevenue,
    recurringExpenses,
    recurringProfit: recurringRevenue - recurringExpenses,
    monthlyExpenses,
    unconverted: { currencies: [...unconvertedCurrencies], count: unconvertedCount },
  }
}
