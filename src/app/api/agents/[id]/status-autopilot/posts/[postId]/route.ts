import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { assertContactsAccess } from "@/lib/contacts-access"
import { swapUpcoming } from "@/lib/status-autopilot-planner"

interface Params {
  params: Promise<{ id: string; postId: string }>
}

const ActionSchema = z.object({ action: z.enum(["skip", "unskip", "swap"]) })

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = ActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 })

  try {
    const { id, postId } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const { action } = parsed.data
    if (action === "swap") {
      const res = await swapUpcoming(id, postId)
      return "error" in res ? NextResponse.json({ error: res.error }, { status: res.status }) : NextResponse.json({ ok: true })
    }

    // A skipped slot stays as a cancelled row, so the planner doesn't fill it
    // again. Un-skipping is only allowed while the slot is still ahead: its
    // delayed job on the worker is still waiting then, and posts it as normal
    // once the row is "scheduled" again.
    const { count } = await db.statusPost.updateMany({
      where: action === "skip"
        ? { id: postId, agentId: id, source: "autopilot", status: "scheduled" }
        : { id: postId, agentId: id, source: "autopilot", status: "cancelled", scheduledAt: { gt: new Date(Date.now() + 5 * 60_000) } },
      data: { status: action === "skip" ? "cancelled" : "scheduled" },
    })
    if (count === 0) return NextResponse.json({ error: "That post can't be changed any more" }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-autopilot/posts/:postId]", error)
    return NextResponse.json({ error: "Failed to update the post" }, { status: 500 })
  }
}
