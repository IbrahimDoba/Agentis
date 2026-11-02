import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { assertContactsAccess } from "@/lib/contacts-access"

interface Params {
  params: Promise<{ id: string; itemId: string }>
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
