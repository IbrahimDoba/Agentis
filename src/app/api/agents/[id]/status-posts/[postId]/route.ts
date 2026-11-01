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
