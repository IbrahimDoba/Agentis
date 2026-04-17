import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Returns workspaces the current user is a member of (not their own)
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const memberships = await db.workspaceMember.findMany({
    where: { userId: session.user.id, status: "ACCEPTED" },
    select: {
      workspaceId: true,
      role: true,
      workspace: { select: { name: true, businessName: true } },
    },
  })

  const workspaces = memberships.map((m) => ({
    id: m.workspaceId,
    name: m.workspace.businessName || m.workspace.name,
    role: m.role,
  }))

  return NextResponse.json({ workspaces })
}
