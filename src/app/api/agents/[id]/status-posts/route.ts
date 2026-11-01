import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { assertContactsAccess } from "@/lib/contacts-access"
import {
  AI_NOTE_MAX,
  CAPTION_MAX,
  MAX_POSTS_PER_DAY,
  MAX_SCHEDULE_DAYS,
  STATUS_CREDITS,
  TEXT_BACKGROUNDS,
  TEXT_STATUS_MAX,
  isVideoMime,
  lagosDayBounds,
  recipientCapFor,
} from "@/lib/status-post"

interface Params {
  params: Promise<{ id: string }>
}

const CreateSchema = z
  .object({
    kind: z.enum(["text", "image", "video"]),
    text: z.string().trim().max(Math.max(TEXT_STATUS_MAX, CAPTION_MAX)).optional(),
    backgroundColor: z.enum(TEXT_BACKGROUNDS).optional(),
    mediaItemId: z.string().uuid().optional(),
    aiNote: z.string().trim().max(AI_NOTE_MAX).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((b) => b.kind !== "text" || !!b.text, { path: ["text"], message: "Write something for a text status" })
  .refine((b) => b.kind !== "text" || (b.text?.length ?? 0) <= TEXT_STATUS_MAX, { path: ["text"], message: `Keep a text status to ${TEXT_STATUS_MAX} characters` })
  .refine((b) => b.kind === "text" || !!b.mediaItemId, { path: ["mediaItemId"], message: "Add an image or video" })

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const { start, end } = lagosDayBounds(new Date())
    const [posts, contacts, postsToday] = await Promise.all([
      db.statusPost.findMany({ where: { agentId: id }, orderBy: { scheduledAt: "desc" }, take: 50 }),
      db.whatsAppContact.count({ where: { agentId: id } }),
      db.statusPost.count({ where: { agentId: id, scheduledAt: { gte: start, lt: end }, status: { notIn: ["cancelled", "failed"] } } }),
    ])

    return NextResponse.json({
      posts: posts.map((p) => ({
        id: p.id,
        kind: p.kind,
        text: p.text,
        backgroundColor: p.backgroundColor,
        mediaItemId: p.mediaItemId,
        aiNote: p.aiNote,
        status: p.status,
        scheduledAt: p.scheduledAt.toISOString(),
        postedAt: p.postedAt?.toISOString() ?? null,
        recipientCount: p.recipientCount,
        creditsUsed: p.creditsUsed,
        error: p.error,
      })),
      audience: { contacts, cap: recipientCapFor(access.agent.user.plan) },
      postsToday,
      maxPostsPerDay: MAX_POSTS_PER_DAY,
      credits: STATUS_CREDITS,
    })
  } catch (error) {
    console.error("[GET /api/agents/:id/status-posts]", error)
    return NextResponse.json({ error: "Failed to load status posts" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid post", details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { spending: true, feature: "status" })
    if ("error" in access) return access.error

    const now = Date.now()
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date(now)
    if (scheduledAt.getTime() < now - 5 * 60_000) return NextResponse.json({ error: "That time has already passed" }, { status: 400 })
    if (scheduledAt.getTime() > now + MAX_SCHEDULE_DAYS * 86_400_000) {
      return NextResponse.json({ error: `Schedule up to ${MAX_SCHEDULE_DAYS} days ahead` }, { status: 400 })
    }

    if (body.mediaItemId) {
      const item = await db.mediaItem.findFirst({ where: { id: body.mediaItemId, agentId: id }, select: { mimeType: true } })
      if (!item) return NextResponse.json({ error: "That file is no longer in your media library" }, { status: 404 })
      const fits = body.kind === "video" ? isVideoMime(item.mimeType) : item.mimeType.startsWith("image/")
      if (!fits) return NextResponse.json({ error: `That library file isn't ${body.kind === "video" ? "a video" : "an image"}` }, { status: 400 })
    }

    if ((await db.whatsAppContact.count({ where: { agentId: id } })) === 0) {
      return NextResponse.json({ error: "Status only reaches saved contacts. Save your chats in the Contacts tab first." }, { status: 409 })
    }

    const { start, end } = lagosDayBounds(scheduledAt)
    const sameDay = await db.statusPost.count({
      where: { agentId: id, scheduledAt: { gte: start, lt: end }, status: { notIn: ["cancelled", "failed"] } },
    })
    if (sameDay >= MAX_POSTS_PER_DAY) {
      return NextResponse.json({ error: `You can post up to ${MAX_POSTS_PER_DAY} statuses a day` }, { status: 409 })
    }

    const post = await db.statusPost.create({
      data: {
        agentId: id,
        kind: body.kind,
        text: body.text || null,
        backgroundColor: body.kind === "text" ? (body.backgroundColor ?? TEXT_BACKGROUNDS[0]) : null,
        font: body.kind === "text" ? 1 : null,
        mediaItemId: body.kind === "text" ? null : (body.mediaItemId ?? null),
        aiNote: body.aiNote || null,
        scheduledAt,
      },
    })

    const res = await baileysClient.scheduleStatusPost(id, post.id)
    if (!res.ok) {
      await db.statusPost.updateMany({ where: { id: post.id, status: "scheduled" }, data: { status: "failed", error: "Couldn't reach the WhatsApp worker" } })
      return NextResponse.json({ error: "Couldn't schedule the post. Try again in a minute." }, { status: 502 })
    }
    return NextResponse.json({ post: { id: post.id, status: post.status, scheduledAt: post.scheduledAt.toISOString() } }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-posts]", error)
    return NextResponse.json({ error: "Failed to create the post" }, { status: 500 })
  }
}
