import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { AUTO_BUILD_DISMISSED, AUTO_BUILD_DONE } from "@/lib/autoBuild"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  try {
    const { ownerId } = await getWorkspaceContext(session.user.id)
    await db.agent.updateMany({
      where: { id, userId: ownerId, autoConfigStatus: AUTO_BUILD_DONE },
      data: { autoConfigStatus: AUTO_BUILD_DISMISSED },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[POST /api/agents/[id]/auto-build/dismiss]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
