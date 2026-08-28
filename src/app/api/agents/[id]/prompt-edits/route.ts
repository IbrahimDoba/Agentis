import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"

// Edit history for the agent's system prompt.

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId } = await params

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId }, select: { id: true } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const edits = await db.promptEdit.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 50,
    // beforeValue/afterValue are deliberately excluded — a prompt can be 390KB
    // and the list would ship one copy per row.
    select: {
      id: true,
      instruction: true,
      ops: true,
      snapshotTruncated: true,
      model: true,
      revertedAt: true,
      createdAt: true,
      userId: true,
    },
  })

  // Only the newest non-reverted edit can be rolled back: reverting an older one
  // would silently discard everything applied after it.
  const revertableId = edits.find((e) => !e.revertedAt)?.id ?? null

  return NextResponse.json({
    revertableId,
    edits: edits.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
      revertedAt: e.revertedAt?.toISOString() ?? null,
    })),
  })
}
