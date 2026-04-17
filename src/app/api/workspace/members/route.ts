import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)

  const [owner, members] = await Promise.all([
    db.user.findUnique({
      where: { id: ownerId },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId: ownerId },
      orderBy: { invitedAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        invitedAt: true,
        joinedAt: true,
        user: { select: { name: true, id: true } },
      },
    }),
  ])

  const ownerEntry = owner
    ? {
        id: `owner-${owner.id}`,
        email: owner.email,
        role: "OWNER" as const,
        status: "ACCEPTED" as const,
        invitedAt: owner.createdAt.toISOString(),
        joinedAt: owner.createdAt.toISOString(),
        user: { name: owner.name, id: owner.id },
        isOwner: true,
      }
    : null

  const enrichedMembers = members.map((m) => ({ ...m, isOwner: false }))

  return NextResponse.json({
    members: ownerEntry ? [ownerEntry, ...enrichedMembers] : enrichedMembers,
  })
}
