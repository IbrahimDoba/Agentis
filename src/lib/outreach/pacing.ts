// Send pacing.
//
// The campaign shares dailzero.com with every transactional email, so burst
// behaviour is the thing most likely to cost us. Zoho's outgoing limit is a
// rolling hourly window with automated enforcement on spikes, and receiving
// providers read "30 messages in 20 seconds from a mailbox that normally sends
// a handful" as exactly what it looks like.
//
// So sends are dripped: a small slice per cron invocation, with a randomised
// gap between each. Same reasoning as the WhatsApp pacing in
// worker/src/anti-ban/pacing.ts, and the numbers are the same order.

export const HOURLY_CAP = Number(process.env.OUTREACH_HOURLY_CAP ?? 5)

/** Messages released per cron invocation. Small enough to fit inside maxDuration. */
export const SLICE_SIZE = Number(process.env.OUTREACH_SLICE_SIZE ?? 3)

export const MIN_GAP_MS = 30_000
export const MAX_GAP_MS = 90_000

/**
 * A gap drawn from a truncated normal rather than uniform, so the spacing looks
 * like a person working through a list instead of a scheduler firing on a
 * constant interval. Box-Muller, mirroring worker/src/anti-ban/distribution.ts.
 */
export function nextGapMs(random: () => number = Math.random): number {
  const mean = (MIN_GAP_MS + MAX_GAP_MS) / 2
  const stdDev = (MAX_GAP_MS - MIN_GAP_MS) / 6

  for (let attempt = 0; attempt < 8; attempt++) {
    const u1 = Math.max(random(), Number.EPSILON)
    const u2 = random()
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    const value = mean + normal * stdDev
    if (value >= MIN_GAP_MS && value <= MAX_GAP_MS) return Math.round(value)
  }
  // Rejection sampling can in principle keep missing; fall back to the mean
  // rather than looping forever or returning something out of range.
  return Math.round(mean)
}

/**
 * How many may be sent right now, given the caps and what has already gone out.
 * Returns 0 when any ceiling is reached — the caller stops rather than waiting,
 * because the next cron run is only minutes away.
 */
export function allowedNow(args: {
  sentToday: number
  sentLastHour: number
  dailyCap: number
  hourlyCap?: number
  sliceSize?: number
}): number {
  const dayRoom = Math.max(0, args.dailyCap - args.sentToday)
  const hourRoom = Math.max(0, (args.hourlyCap ?? HOURLY_CAP) - args.sentLastHour)
  return Math.min(dayRoom, hourRoom, args.sliceSize ?? SLICE_SIZE)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
