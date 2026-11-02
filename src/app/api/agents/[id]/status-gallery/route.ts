import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { assertContactsAccess } from "@/lib/contacts-access"
import { StatusContentSchema, checkMediaItem, refineStatusContent, upsertGalleryItem } from "@/lib/status-gallery"

interface Params {
  params: Promise<{ id: string }>
}

const SaveSchema = refineStatusContent(StatusContentSchema)
const GALLERY_LIMIT = 60

// Everything the owner has posted or saved, most recently used first, with how
// often each went out and its best result.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const items = await db.statusGalleryItem.findMany({
      where: { agentId: id, hiddenAt: null },
      orderBy: { updatedAt: "desc" },
      take: GALLERY_LIMIT,
    })
    const ids = items.map((i) => i.id)
    const mediaIds = items.map((i) => i.mediaItemId).filter((m): m is string => !!m)

    const [posts, media] = await Promise.all([
      db.statusPost.findMany({
        where: { galleryItemId: { in: ids }, postedAt: { not: null } },
        select: { id: true, galleryItemId: true, postedAt: true },
      }),
      db.mediaItem.findMany({ where: { agentId: id, id: { in: mediaIds } }, select: { id: true } }),
    ])
    const funnel = await db.statusView.groupBy({
      by: ["postId"],
      where: { postId: { in: posts.map((p) => p.id) } },
      _count: { viewedAt: true, repliedAt: true },
    })
    const funnelByPost = new Map(funnel.map((f) => [f.postId, f._count]))
    const liveMedia = new Set(media.map((m) => m.id))

    const stats = new Map<string, { timesPosted: number; lastPostedAt: Date | null; viewed: number; replied: number }>()
    for (const p of posts) {
      const s = stats.get(p.galleryItemId!) ?? { timesPosted: 0, lastPostedAt: null, viewed: 0, replied: 0 }
      s.timesPosted += 1
      if (!s.lastPostedAt || p.postedAt! > s.lastPostedAt) s.lastPostedAt = p.postedAt
      const f = funnelByPost.get(p.id)
      // "Best" is the single post with the most views, not a sum across reposts.
      if (f && f.viewedAt >= s.viewed) {
        s.viewed = f.viewedAt
        s.replied = f.repliedAt
      }
      stats.set(p.galleryItemId!, s)
    }

    return NextResponse.json({
      items: items.map((i) => {
        const s = stats.get(i.id)
        return {
          id: i.id,
          kind: i.kind,
          text: i.text,
          backgroundColor: i.backgroundColor,
          mediaItemId: i.mediaItemId,
          aiNote: i.aiNote,
          mediaMissing: i.kind !== "text" && !(i.mediaItemId && liveMedia.has(i.mediaItemId)),
          timesPosted: s?.timesPosted ?? 0,
          lastPostedAt: s?.lastPostedAt?.toISOString() ?? null,
          bestViewed: s?.viewed ?? 0,
          bestReplied: s?.replied ?? 0,
          createdAt: i.createdAt.toISOString(),
        }
      }),
    })
  } catch (error) {
    console.error("[GET /api/agents/:id/status-gallery]", error)
    return NextResponse.json({ error: "Failed to load the gallery" }, { status: 500 })
  }
}

// Save to the gallery without posting.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = SaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid post", details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const mediaError = await checkMediaItem(id, parsed.data)
    if (mediaError) return NextResponse.json({ error: mediaError.error }, { status: mediaError.status })

    const itemId = await upsertGalleryItem(id, parsed.data)
    return NextResponse.json({ item: { id: itemId } }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-gallery]", error)
    return NextResponse.json({ error: "Failed to save to the gallery" }, { status: 500 })
  }
}
