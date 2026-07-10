import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Soft-delete a conversation. Sets Conversation.deletedAt, which (a) hides it
// from the conversations tab and (b) becomes the AI memory cutoff — the
// orchestrator only reads messages created AFTER this, so the agent forgets the
// prior history. Nothing is destroyed; the row + messages are preserved.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: conversationId } = await params

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { deletedAt: true, agent: { select: { userId: true } } },
  })
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (conversation.agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Idempotent — re-deleting is a no-op (keep the original cutoff timestamp).
  if (!conversation.deletedAt) {
    await db.conversation.update({
      where: { id: conversationId },
      data: { deletedAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
