import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { AUTO_BUILD_BANNER_STATUSES } from "@/lib/autoBuild"

// What the dashboard banner polls: the owner's agent currently being built.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { ownerId } = await getWorkspaceContext(session.user.id)
    const agent = await db.agent.findFirst({
      where: { userId: ownerId, autoConfigStatus: { in: AUTO_BUILD_BANNER_STATUSES } },
      orderBy: { createdAt: "desc" },
      select: { id: true, autoConfigStatus: true },
    })
    return NextResponse.json({ agent: agent ? { id: agent.id, status: agent.autoConfigStatus } : null })
  } catch (error) {
    console.error("[GET /api/agents/auto-build]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
