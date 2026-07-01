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
  const body = await req.json()
  const mode = body?.mode
  const aiLocked = body?.aiLocked

  const hasMode = mode === "ai" || mode === "human"
  const hasLock = typeof aiLocked === "boolean"
  if (!hasMode && !hasLock) {
    return NextResponse.json({ error: "Provide mode ('ai'|'human') and/or aiLocked (boolean)" }, { status: 400 })
  }

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { agentId: true, agent: { select: { userId: true } } },
  })
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data: { mode?: string; aiLocked?: boolean } = {}
  if (hasMode) {
    data.mode = mode
    // Turning the AI back on is an explicit override — clear the "always human" lock.
    if (mode === "ai") data.aiLocked = false
  }
  if (hasLock) {
    data.aiLocked = aiLocked
    // "Always human" implies human mode now, so the timer has nothing to skip past.
    if (aiLocked) data.mode = "human"
  }

  await db.conversation.update({ where: { id: conversationId }, data })

  return NextResponse.json({ ok: true, ...data })
}
