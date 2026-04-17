import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { WORKSPACE_COOKIE } from "@/lib/workspace"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { workspaceId } = await req.json()

  // Switching back to own workspace
  if (!workspaceId || workspaceId === session.user.id) {
    const res = NextResponse.json({ success: true, workspaceId: session.user.id })
    res.cookies.delete(WORKSPACE_COOKIE)
    return res
  }

  // Validate they are an accepted member of the requested workspace
  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "ACCEPTED" },
  })
  if (!member) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const res = NextResponse.json({ success: true, workspaceId })
  res.cookies.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
