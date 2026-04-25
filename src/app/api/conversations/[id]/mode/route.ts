import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: conversationId } = await params
  const { mode } = await req.json()

  if (mode !== "ai" && mode !== "human") {
    return NextResponse.json({ error: "mode must be 'ai' or 'human'" }, { status: 400 })
  }

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { agentId: true, agent: { select: { userId: true } } },
  })
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await db.conversation.update({
    where: { id: conversationId },
    data: { mode },
  })

  return NextResponse.json({ ok: true, mode })
}
