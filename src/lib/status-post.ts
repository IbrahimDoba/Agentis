// Status → Posts rules shared by the composer and the API routes, so no
// server-only imports here. Credits and caps mirror worker/src/baileys/status-post.ts.

export type StatusKind = "text" | "image" | "video"

// Billed like one sent message of the same type (AI_CREDIT_COSTS).
export const STATUS_CREDITS: Record<StatusKind, number> = { text: 5, image: 8, video: 12 }

export const STATUS_RECIPIENT_CAPS: Record<string, number> = {
  free: 500,
  basic: 2000,
  starter: 5000,
  pro: 10000,
  enterprise: 10000,
  reseller: 2000,
}

export function recipientCapFor(plan: string | null | undefined): number {
  return STATUS_RECIPIENT_CAPS[plan ?? ""] ?? STATUS_RECIPIENT_CAPS.basic
}

// More than this reads as spam to contacts and to WhatsApp; Autopilot will
// share the same budget.
export const MAX_POSTS_PER_DAY = 10

export const TEXT_STATUS_MAX = 700
export const CAPTION_MAX = 700
export const AI_NOTE_MAX = 1000
// How far ahead a post can be scheduled.
export const MAX_SCHEDULE_DAYS = 30

export const TEXT_BACKGROUNDS = ["#0b3d2e", "#1f2937", "#7c2d12", "#1e3a8a", "#6b21a8", "#be185d"] as const

// Africa/Lagos is UTC+1 with no DST, so the day is a fixed offset.
const LAGOS_OFFSET_MS = 60 * 60 * 1000

export function lagosDayBounds(at: Date): { start: Date; end: Date } {
  const local = new Date(at.getTime() + LAGOS_OFFSET_MS)
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const start = new Date(startLocal - LAGOS_OFFSET_MS)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export function isVideoMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("video/")
}

// A post's content, carried from the gallery or the posts list into the
// composer for "Post again".
export interface StatusDraft {
  kind: StatusKind
  text: string | null
  backgroundColor: string | null
  mediaItemId: string | null
  aiNote: string | null
}

export function mediaPreviewUrl(agentId: string, mediaItemId: string): string {
  return `/api/agents/${agentId}/media/${mediaItemId}/preview`
}

export type PostProgress = "waiting" | "posting" | "failed"

// How long a failed post stays in the "In progress" list.
const FAILED_VISIBLE_MS = 24 * 60 * 60 * 1000
// Allows for the browser's clock running behind the server's: a post made just
// now shouldn't read as scheduled for later.
const DUE_SLACK_MS = 60_000

// Where a post that hasn't finished stands. A post scheduled for later isn't in
// progress yet, and an old failure is history.
export function postProgress(post: { status: string; scheduledAt: string }, at: number): PostProgress | null {
  const due = new Date(post.scheduledAt).getTime()
  if (post.status === "posting") return "posting"
  if (post.status === "scheduled") return due <= at + DUE_SLACK_MS ? "waiting" : null
  if (post.status === "failed") return at - due <= FAILED_VISIBLE_MS ? "failed" : null
  return null
}
