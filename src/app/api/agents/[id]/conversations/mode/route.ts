import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// PATCH /api/agents/:id/conversations/mode
// Sets ALL conversations for this agent to the given mode
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: agentId } = await params
  const { mode } = await req.json()

  if (mode !== "ai" && mode !== "human") {
    return NextResponse.json({ error: "mode must be 'ai' or 'human'" }, { status: 400 })
  }

  // Verify ownership
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { count } = await db.conversation.updateMany({
    where: { agentId },
    data: { mode },
  })

  return NextResponse.json({ ok: true, updated: count })
}
