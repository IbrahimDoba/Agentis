// Pure helpers for Status → Posts. No config import, so this stays testable
// (see the config.ts landmine in CLAUDE.md).
import { AI_CREDIT_COSTS } from "../billing/credits.js"
import { SAVEABLE_PHONE } from "./contact-save.js"

export type StatusKind = "text" | "image" | "video"

// A status is billed like one sent message of the same type; the recipient
// count is free. Capped per plan instead, because a big statusJidList is what
// loads the shared worker (one encryption per recipient device).
export const STATUS_RECIPIENT_CAPS: Record<string, number> = {
  free: 500,
  basic: 2000,
  starter: 5000,
  pro: 10000,
  enterprise: 10000,
  reseller: 2000,
}

// WhatsApp trims status videos past this anyway; it also bounds transcode CPU.
export const MAX_STATUS_VIDEO_SECONDS = 60

export function statusCredits(kind: StatusKind): number {
  return AI_CREDIT_COSTS[kind]
}

export function recipientCapFor(plan: string | null | undefined): number {
  return STATUS_RECIPIENT_CAPS[plan ?? ""] ?? STATUS_RECIPIENT_CAPS.basic
}

// The poster's own JID goes first: without it the status doesn't show under
// "My status" on the owner's phone, and they can't see or delete it there.
export function statusJidList(phones: string[], ownPhone: string | null, cap: number): { jids: string[]; recipients: number } {
  const seen = new Set<string>()
  if (ownPhone) seen.add(ownPhone)
  const picked: string[] = []
  for (const phone of phones) {
    if (picked.length >= cap) break
    if (!SAVEABLE_PHONE.test(phone) || seen.has(phone)) continue
    seen.add(phone)
    picked.push(phone)
  }
  const jids = picked.map((p) => `${p}@s.whatsapp.net`)
  return { jids: ownPhone ? [`${ownPhone}@s.whatsapp.net`, ...jids] : jids, recipients: picked.length }
}

// The shorter side is brought to 720 (never upscaled). Linked-device posts at
// 1080p High profile reached phones but would not play; this profile does.
export function transcodeArgs(input: string, output: string): string[] {
  return [
    "-v", "error", "-y", "-i", input,
    "-t", String(MAX_STATUS_VIDEO_SECONDS),
    "-vf", "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'",
    "-c:v", "libx264", "-profile:v", "main", "-level", "3.1", "-pix_fmt", "yuv420p",
    "-preset", "veryfast", "-crf", "26",
    "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-movflags", "+faststart",
    "-threads", "1",
    output,
  ]
}

interface QuotedStatus {
  conversation?: string | null
  extendedTextMessage?: { text?: string | null } | null
  imageMessage?: { caption?: string | null } | null
  videoMessage?: { caption?: string | null } | null
}

// What the AI sees in front of a reply to the owner's status. The old generic
// "[Replying to: ...]" gave a captionless video nothing at all.
export function statusReplyLabel(quoted: QuotedStatus | null | undefined, note: string | null): string {
  const what = quoted?.videoMessage ? "a video" : quoted?.imageMessage ? "an image" : "a text post"
  const caption =
    quoted?.videoMessage?.caption ||
    quoted?.imageMessage?.caption ||
    quoted?.extendedTextMessage?.text ||
    quoted?.conversation ||
    null
  const label = caption
    ? `[Replying to your WhatsApp status (${what}): "${caption.trim()}"]`
    : `[Replying to your WhatsApp status: ${what} with no caption]`
  return note?.trim() ? `${label}\n[What this status is about: ${note.trim()}]` : label
}
