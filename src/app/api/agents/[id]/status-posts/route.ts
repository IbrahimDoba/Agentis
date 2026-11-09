import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { assertContactsAccess } from "@/lib/contacts-access"
import { MAX_POSTS_PER_DAY, MAX_SCHEDULE_DAYS, STATUS_CREDITS, lagosDayBounds, recipientCapFor } from "@/lib/status-post"
import { StatusContentSchema, checkMediaItem, contentColumns, refineStatusContent, upsertGalleryItem } from "@/lib/status-gallery"

interface Params {
  params: Promise<{ id: string }>
}

const CreateSchema = refineStatusContent(StatusContentSchema.extend({ scheduledAt: z.string().datetime({ offset: true }).optional() }))

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const { start, end } = lagosDayBounds(new Date())
    const [posts, contacts, postsToday] = await Promise.all([
      // Autopilot plans a week ahead; those posts live in the Autopilot tab
      // until they're about to go out, or they'd crowd out everything else.
      db.statusPost.findMany({
        where: {
          agentId: id,
          NOT: {
            source: "autopilot",
            OR: [{ status: "cancelled", postedAt: null }, { status: "scheduled", scheduledAt: { gt: new Date(Date.now() + 10 * 60_000) } }],
          },
        },
        orderBy: { scheduledAt: "desc" },
        take: 50,
      }),
      db.whatsAppContact.count({ where: { agentId: id } }),
      db.statusPost.count({ where: { agentId: id, scheduledAt: { gte: start, lt: end }, status: { notIn: ["cancelled", "failed"] } } }),
    ])

    // _count on a nullable column counts the non-null rows: people who got to
    // that step.
    const funnel = await db.statusView.groupBy({
      by: ["postId"],
      where: { postId: { in: posts.map((p) => p.id) } },
      _count: { deliveredAt: true, viewedAt: true, likedAt: true, repliedAt: true },
    })
    const funnelByPost = new Map(funnel.map((f) => [f.postId, f._count]))

    return NextResponse.json({
      posts: posts.map((p) => ({
        id: p.id,
        kind: p.kind,
        text: p.text,
        backgroundColor: p.backgroundColor,
        mediaItemId: p.mediaItemId,
        aiNote: p.aiNote,
        galleryItemId: p.galleryItemId,
        source: p.source,
        status: p.status,
        scheduledAt: p.scheduledAt.toISOString(),
        postedAt: p.postedAt?.toISOString() ?? null,
        recipientCount: p.recipientCount,
        creditsUsed: p.creditsUsed,
        error: p.error,
        delivered: funnelByPost.get(p.id)?.deliveredAt ?? 0,
        viewed: funnelByPost.get(p.id)?.viewedAt ?? 0,
        liked: funnelByPost.get(p.id)?.likedAt ?? 0,
        replied: funnelByPost.get(p.id)?.repliedAt ?? 0,
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

    const mediaError = await checkMediaItem(id, body)
    if (mediaError) return NextResponse.json({ error: mediaError.error }, { status: mediaError.status })

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

    const galleryItemId = await upsertGalleryItem(id, body)
    const post = await db.statusPost.create({
      data: {
        agentId: id,
        ...contentColumns(body),
        font: body.kind === "text" ? 1 : null,
        scheduledAt,
        galleryItemId,
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
