import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params { params: Promise<{ memberId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { memberId } = await params
  const { role } = await req.json()
  if (!["ADMIN", "MEMBER"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 })

  const member = await db.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: session.user.id },
  })
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  const updated = await db.workspaceMember.update({
    where: { id: memberId },
    data: { role },
    select: { id: true, email: true, role: true, status: true },
  })

  return NextResponse.json({ member: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { memberId } = await params

  const member = await db.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: session.user.id },
  })
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  await db.workspaceMember.update({
    where: { id: memberId },
    data: { status: "REVOKED" },
  })

  return NextResponse.json({ success: true })
}
