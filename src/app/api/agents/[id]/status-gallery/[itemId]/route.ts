import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { assertContactsAccess } from "@/lib/contacts-access"
import { TAGS_PER_ITEM, normalizeTags } from "@/lib/status-autopilot"
import { planAutopilot } from "@/lib/status-autopilot-planner"

interface Params {
  params: Promise<{ id: string; itemId: string }>
}

const PatchSchema = z
  .object({
    tags: z.array(z.string().max(40)).max(20).optional(),
    autopilot: z.boolean().optional(),
  })
  .refine((b) => b.tags !== undefined || b.autopilot !== undefined, { message: "Nothing to change" })

// Tags and the Autopilot tick. Either can change what Autopilot would pick, so
// an active plan is planned again.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  try {
    const { id, itemId } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const tags = parsed.data.tags && normalizeTags(parsed.data.tags)
    if (tags && tags.length > TAGS_PER_ITEM) return NextResponse.json({ error: `Use up to ${TAGS_PER_ITEM} tags` }, { status: 400 })

    const { count } = await db.statusGalleryItem.updateMany({
      where: { id: itemId, agentId: id, hiddenAt: null },
      data: { ...(tags ? { tags } : {}), ...(parsed.data.autopilot !== undefined ? { autopilot: parsed.data.autopilot } : {}) },
    })
    if (count === 0) return NextResponse.json({ error: "Not in your gallery" }, { status: 404 })

    planAutopilot(id, { replan: true, keepSkips: true }).catch((err) => console.error("[PATCH /api/agents/:id/status-gallery/:itemId] replan", err))
    return NextResponse.json({ ok: true, tags: tags ?? undefined })
  } catch (error) {
    console.error("[PATCH /api/agents/:id/status-gallery/:itemId]", error)
    return NextResponse.json({ error: "Failed to update the card" }, { status: 500 })
  }
}

// Removes the card from the gallery only. The library file and post history
// stay, and posting the same content again brings the card back.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id, itemId } = await params
    const access = await assertContactsAccess(id, session.user.id, session.user.role, { feature: "status" })
    if ("error" in access) return access.error

    const { count } = await db.statusGalleryItem.updateMany({
      where: { id: itemId, agentId: id, hiddenAt: null },
      data: { hiddenAt: new Date() },
    })
    if (count === 0) return NextResponse.json({ error: "Not in your gallery" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/agents/:id/status-gallery/:itemId]", error)
    return NextResponse.json({ error: "Failed to remove from the gallery" }, { status: 500 })
  }
}
