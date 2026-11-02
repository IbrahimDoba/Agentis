import { createHash } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { AI_NOTE_MAX, CAPTION_MAX, TEXT_BACKGROUNDS, TEXT_STATUS_MAX, isVideoMime, type StatusKind } from "@/lib/status-post"

// Server-only (node crypto). The same content must always produce the same key,
// so reposts land on one gallery card. Mirrors the backfill in the
// 20261104000000_status_gallery migration; change both together.
export function statusContentKey(post: { kind: StatusKind; text?: string | null; backgroundColor?: string | null; mediaItemId?: string | null }): string {
  if (post.kind !== "text") return `media:${post.mediaItemId ?? ""}`
  const digest = createHash("sha256").update(`${post.backgroundColor ?? ""}\n${post.text ?? ""}`, "utf8").digest("hex")
  return `text:${digest}`
}

// What a post (or a gallery card saved without posting) is made of. Shared by
// the post and gallery routes so a card always holds something postable.
export const StatusContentSchema = z
  .object({
    kind: z.enum(["text", "image", "video"]),
    text: z.string().trim().max(Math.max(TEXT_STATUS_MAX, CAPTION_MAX)).optional(),
    backgroundColor: z.enum(TEXT_BACKGROUNDS).optional(),
    mediaItemId: z.string().uuid().optional(),
    aiNote: z.string().trim().max(AI_NOTE_MAX).optional(),
  })

export type StatusContent = z.infer<typeof StatusContentSchema>

export function refineStatusContent<T extends z.ZodType<StatusContent>>(schema: T) {
  return schema
    .refine((b) => b.kind !== "text" || !!b.text, { path: ["text"], message: "Write something for a text status" })
    .refine((b) => b.kind !== "text" || (b.text?.length ?? 0) <= TEXT_STATUS_MAX, { path: ["text"], message: `Keep a text status to ${TEXT_STATUS_MAX} characters` })
    .refine((b) => b.kind === "text" || !!b.mediaItemId, { path: ["mediaItemId"], message: "Add an image or video" })
}

// The columns a post and its card share, normalised the same way for both.
export function contentColumns(c: StatusContent) {
  const text = c.kind === "text"
  return {
    kind: c.kind,
    text: c.text || null,
    backgroundColor: text ? (c.backgroundColor ?? TEXT_BACKGROUNDS[0]) : null,
    mediaItemId: text ? null : (c.mediaItemId ?? null),
    aiNote: c.aiNote || null,
  }
}

// The library file must still exist, belong to this agent and match the type.
export async function checkMediaItem(agentId: string, c: StatusContent): Promise<{ error: string; status: number } | null> {
  if (c.kind === "text" || !c.mediaItemId) return null
  const item = await db.mediaItem.findFirst({ where: { id: c.mediaItemId, agentId }, select: { mimeType: true } })
  if (!item) return { error: "That file is no longer in your media library", status: 404 }
  const fits = c.kind === "video" ? isVideoMime(item.mimeType) : item.mimeType.startsWith("image/")
  if (!fits) return { error: `That library file isn't ${c.kind === "video" ? "a video" : "an image"}`, status: 400 }
  return null
}

// Find-or-create the card for this content. Posting it again brings back a
// removed card and moves it to the front; an empty AI note doesn't wipe the
// one already written for it.
export async function upsertGalleryItem(agentId: string, c: StatusContent): Promise<string> {
  const cols = contentColumns(c)
  const contentKey = statusContentKey(cols as Parameters<typeof statusContentKey>[0])
  const item = await db.statusGalleryItem.upsert({
    where: { agentId_contentKey: { agentId, contentKey } },
    create: { agentId, contentKey, ...cols },
    update: { text: cols.text, ...(cols.aiNote ? { aiNote: cols.aiNote } : {}), hiddenAt: null },
    select: { id: true },
  })
  return item.id
}
