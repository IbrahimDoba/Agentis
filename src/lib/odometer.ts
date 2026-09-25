// Splits a count into the cells a rolling-digit ticker renders: one cell per
// digit (which gets its own scrolling 0-9 column) and one per group separator
// (which stays put). Pure and separate from the component because the awkward
// cases are all arithmetic — zero, a value that grows a digit mid-roll, and
// anything that is not a finite number arriving from a polled endpoint.

export type TickerCell =
  | { kind: "digit"; value: number }
  | { kind: "separator"; char: string }

/** Locale used for grouping. Every reader of these numbers is Nigerian. */
const LOCALE = "en-NG"

export function toTickerCells(value: number): TickerCell[] {
  return formatCount(value)
    .split("")
    .map((char) =>
      char >= "0" && char <= "9"
        ? { kind: "digit" as const, value: Number(char) }
        : { kind: "separator" as const, char }
    )
}

/**
 * The grouped string the ticker and its screen-reader label share.
 *
 * Clamped at zero and floored: a counter of lifetime totals cannot be negative
 * or fractional, and a bad payload should degrade to "0" rather than render a
 * row of separator cells with no digits in them.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0"
  return Math.floor(value).toLocaleString(LOCALE)
}
