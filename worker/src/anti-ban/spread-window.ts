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
