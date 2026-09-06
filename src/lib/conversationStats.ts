// Pure stats maths for the dashboard Overview cards. No db imports — the
// counting lives in lib/queries/conversationStats.ts so this stays unit-testable.

/**
 * Share of conversations that produced a lead, as a whole percent.
 *
 * Returns null (not 0) when there are no conversations to divide by. The card
 * previously rendered `0%` in that case, which read as "nothing converted" for
 * an agent that had leads but no conversations *started* in the window.
 *
 * `converted` must be drawn from the SAME cohort as `conversations` — i.e. the
 * conversations created in the window that carry a lead, NOT every lead created
 * in the window. Counting leads from older conversations against a window's new
 * conversations is what produced live values like 1100%.
 */
export function leadsRate(converted: number, conversations: number): number | null {
  if (conversations <= 0) return null
  // Clamped defensively: same-cohort counting already bounds this at 100, but a
  // future caller passing mismatched cohorts should not be able to print 1100%.
  return Math.min(100, Math.round((converted / conversations) * 100))
}
