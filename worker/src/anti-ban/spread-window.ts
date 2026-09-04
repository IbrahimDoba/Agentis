/**
 * How long a broadcast's send is spread over, and the floor on that window.
 *
 * Lives here rather than in queue/broadcast-queue.ts because that module builds
 * a BullMQ Queue and Worker at import time — anything importing it opens a Redis
 * connection, which a unit test should not do. Three call sites share this rule:
 * the worker route's validation, the queue's pacing, and the dashboard API.
 */

/**
 * A list this size or smaller may use a window under 24h, including 0.
 *
 * 0 means "no even-spreading": pacing falls back to the natural anti-ban gap
 * alone, so messages land roughly 8-20s apart. Above this size the 24h floor
 * still applies — pushing 100+ contacts out over minutes is the pattern that
 * gets WhatsApp accounts banned, which is why the floor exists at all.
 *
 * 10 is not arbitrary: broadcast-queue.ts already inserts a batch break every
 * 10 messages, i.e. it treats 10 as one human-sized burst.
 */
export const SMALL_LIST_MAX_RECIPIENTS = 10

/** Smallest window this recipient count is allowed to ask for, in hours. */
export function minSpreadHours(recipientCount: number): number {
  return recipientCount <= SMALL_LIST_MAX_RECIPIENTS ? 0 : 24
}

/**
 * The window actually used for pacing. `requested` is the campaign's stored
 * spreadHours; null/undefined means the caller expressed no preference and gets
 * the 24h default regardless of list size.
 */
export function resolveSpreadHours(recipientCount: number, requested: number | null | undefined): number {
  const hours = requested ?? 24
  return Math.min(168, Math.max(minSpreadHours(recipientCount), hours))
}

// ── Overnight quiet window ──────────────────────────────────────────────────
// Per-agent (Agent.broadcastPauseOvernight, default on): no broadcast sends
// between 23:00 and 06:00 in the agent's timezone. A send that would land in
// that window is pushed to the next 06:00, so a run pauses overnight and
// resumes in the morning.

export const QUIET_START_HOUR = 23
export const QUIET_END_HOUR = 6

/**
 * If `sendAtMs` falls inside the overnight quiet window (23:00–06:00 in `tz`),
 * return the timestamp of the next 06:00 local; otherwise return it unchanged.
 * Pure + timezone-aware (via Intl), so it's unit-testable without a DB or clock.
 */
export function deferPastQuietHours(sendAtMs: number, tz: string): number {
  // Offset between `tz` wall-clock and UTC at this instant (constant for a
  // no-DST zone like Africa/Lagos; fine elsewhere away from a DST edge).
  const utcMs = new Date(new Date(sendAtMs).toLocaleString("en-US", { timeZone: "UTC" })).getTime()
  const tzMs = new Date(new Date(sendAtMs).toLocaleString("en-US", { timeZone: tz })).getTime()
  const offsetMs = tzMs - utcMs

  const local = new Date(sendAtMs + offsetMs) // read wall-clock parts via getUTC*
  const hour = local.getUTCHours()
  if (hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR) return sendAtMs // daytime — send as-is

  const target = new Date(sendAtMs + offsetMs)
  target.setUTCHours(QUIET_END_HOUR, 0, 0, 0)
  if (hour >= QUIET_START_HOUR) target.setUTCDate(target.getUTCDate() + 1) // late night → next-day 6am
  return target.getTime() - offsetMs
}
