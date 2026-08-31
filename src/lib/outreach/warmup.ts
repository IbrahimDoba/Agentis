// Sending-domain warmup.
//
// Cold outreach runs from a subdomain (go.dailzero.com) so the root domain,
// which carries every verification code and password reset, keeps its own
// reputation. That isolation is only worth anything if the subdomain is warmed:
// a brand-new sending identity that opens at 30/day to strangers looks exactly
// like a compromised host, and the damage does partially bleed to the parent.
//
// So the ramp is computed here rather than left to whoever last edited the env
// var. The effective cap is always the lower of the configured cap and the ramp.

export type WarmupStage = {
  day: number
  cap: number
  // True once the ramp is done and the configured cap is the only limit.
  complete: boolean
}

// Standard ramp, ~3 weeks. Deliberately conservative at the start: the first
// few days set the tone for how the receiving side classifies the subdomain.
const SCHEDULE: { throughDay: number; cap: number }[] = [
  { throughDay: 3, cap: 5 },
  { throughDay: 7, cap: 10 },
  { throughDay: 14, cap: 15 },
  { throughDay: 21, cap: 25 },
]

export const WARMUP_DAYS = SCHEDULE[SCHEDULE.length - 1].throughDay

/** Day 1 is the day warmup started, so a same-day send is day 1, not day 0. */
export function warmupDay(startedAt: Date, now: Date): number {
  const elapsedMs = now.getTime() - startedAt.getTime()
  return Math.floor(elapsedMs / 86_400_000) + 1
}

export function warmupStage(startedAt: Date | null, fullCap: number, now = new Date()): WarmupStage {
  // No start date means warmup was never begun. Treat that as day 1 rather than
  // as "complete" — the safe reading of a missing value is the strictest one.
  if (!startedAt) return { day: 1, cap: Math.min(SCHEDULE[0].cap, fullCap), complete: false }

  const day = warmupDay(startedAt, now)
  if (day < 1) return { day: 1, cap: Math.min(SCHEDULE[0].cap, fullCap), complete: false }

  for (const step of SCHEDULE) {
    if (day <= step.throughDay) {
      return { day, cap: Math.min(step.cap, fullCap), complete: false }
    }
  }
  return { day, cap: fullCap, complete: true }
}

/** Parses OUTREACH_WARMUP_STARTED_AT (YYYY-MM-DD or any Date-parseable string). */
export function parseWarmupStart(raw: string | undefined): Date | null {
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
