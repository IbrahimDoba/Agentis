import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { assertContactsAccess } from "@/lib/contacts-access"

interface Params {
  params: Promise<{ id: string; postId: string }>
}

const ActionSchema = z.object({ action: z.enum(["cancel", "delete"]) })

// Who reacted to one post, most engaged first: replied, then liked, then viewed.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id, postId } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const post = await db.statusPost.findFirst({ where: { id: postId, agentId: id }, select: { id: true } })
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 })

    const views = await db.statusView.findMany({
      where: { postId, OR: [{ viewedAt: { not: null } }, { likedAt: { not: null } }, { repliedAt: { not: null } }] },
      orderBy: [{ repliedAt: { sort: "desc", nulls: "last" } }, { likedAt: { sort: "desc", nulls: "last" } }, { viewedAt: "desc" }],
      take: 500,
    })
    const phones = views.map((v) => v.phone)
    const [saved, chats] = await Promise.all([
      db.whatsAppContact.findMany({ where: { agentId: id, phone: { in: phones } }, select: { phone: true, name: true } }),
      db.conversation.findMany({ where: { agentId: id, phoneNumber: { in: phones } }, select: { phoneNumber: true, contactName: true } }),
    ])
    // The owner's own saved name reads best; the customer's push name is the fallback.
    const names = new Map<string, string>()
    for (const c of chats) if (c.contactName) names.set(c.phoneNumber, c.contactName)
    for (const c of saved) names.set(c.phone, c.name)

    return NextResponse.json({
      people: views.map((v) => ({
        phone: v.phone,
        name: names.get(v.phone) ?? null,
        viewedAt: v.viewedAt?.toISOString() ?? null,
        likedAt: v.likedAt?.toISOString() ?? null,
        repliedAt: v.repliedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    console.error("[GET /api/agents/:id/status-posts/:postId]", error)
    return NextResponse.json({ error: "Failed to load post analytics" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 })

  try {
    const { id, postId } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    if (parsed.data.action === "cancel") {
      // Guarded: once the worker has claimed it ("posting") it's too late.
      const { count } = await db.statusPost.updateMany({
        where: { id: postId, agentId: id, status: "scheduled" },
        data: { status: "cancelled" },
      })
      if (count === 0) return NextResponse.json({ error: "This post is no longer scheduled" }, { status: 409 })
      return NextResponse.json({ ok: true })
    }

    const res = await baileysClient.deleteStatusPost(id, postId)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-posts/:postId]", error)
    return NextResponse.json({ error: "Failed to update the post" }, { status: 500 })
  }
}
