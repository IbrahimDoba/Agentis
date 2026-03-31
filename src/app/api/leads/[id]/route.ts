import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params { params: Promise<{ id: string }> }

// PATCH /api/leads/[id] — update status or notes
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead || lead.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const updated = await db.lead.update({
    where: { id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      updatedAt: new Date(),
    },
  })

  return NextResponse.json({ lead: updated })
}

// DELETE /api/leads/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead || lead.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await db.lead.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
