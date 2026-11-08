import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { assertContactsAccess } from "@/lib/contacts-access"
import { TAGS_PER_ITEM, normalizeTags } from "@/lib/status-autopilot"
import { suggestTags } from "@/lib/status-autopilot-ai"
import { planAutopilot } from "@/lib/status-autopilot-planner"

interface Params {
  params: Promise<{ id: string }>
}

// Tag suggestions for cards that have none yet. Returned for the owner to look
// over; nothing is saved here.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const items = await db.statusGalleryItem.findMany({
      where: { agentId: id, hiddenAt: null },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: { id: true, kind: true, text: true, aiNote: true, tags: true },
    })
    const vocabulary = [...new Set(items.flatMap((i) => i.tags))]
    const untagged = items.filter((i) => i.tags.length === 0)
    const suggestions = await suggestTags(untagged, vocabulary)
    return NextResponse.json({ suggestions, untagged: untagged.length })
  } catch (error) {
    console.error("[POST /api/agents/:id/status-gallery/suggest-tags]", error)
    return NextResponse.json({ error: "Couldn't suggest tags right now" }, { status: 500 })
  }
}

const ApplySchema = z.object({
  apply: z.array(z.object({ id: z.string().min(1), tags: z.array(z.string().max(40)).max(TAGS_PER_ITEM) })).min(1).max(60),
})

// The owner accepted the suggestions: save them all, then plan once.
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = ApplySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid tags" }, { status: 400 })

  try {
    const { id } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    await db.$transaction(
      parsed.data.apply.map((a) =>
        db.statusGalleryItem.updateMany({ where: { id: a.id, agentId: id, hiddenAt: null }, data: { tags: normalizeTags(a.tags) } }),
      ),
    )
    planAutopilot(id, { replan: true, keepSkips: true }).catch((err) => console.error("[PUT /api/agents/:id/status-gallery/suggest-tags] replan", err))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[PUT /api/agents/:id/status-gallery/suggest-tags]", error)
    return NextResponse.json({ error: "Failed to save the tags" }, { status: 500 })
  }
}
