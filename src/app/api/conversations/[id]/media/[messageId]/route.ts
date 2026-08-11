import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

interface Params { params: Promise<{ id: string; messageId: string }> }

// Serve a conversation message's image. The Message stores an R2 object KEY in
// `mediaUrl` (the bucket is private). We verify the caller owns the conversation,
// then redirect to a short-lived signed URL fetched from the orchestrator — so
// customer-sent images are never publicly accessible.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, messageId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  // Ownership: the conversation must belong to an agent in the active workspace.
  const conv = await db.conversation.findFirst({
    where: { id, agent: { userId: ownerId } },
    select: { id: true },
  })
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const msg = await db.message.findFirst({
    where: { id: messageId, conversationId: id },
    select: { mediaUrl: true },
  })
  if (!msg?.mediaUrl) return NextResponse.json({ error: "No media" }, { status: 404 })
  if (!ORCHESTRATOR_API_KEY) return NextResponse.json({ error: "Not configured" }, { status: 500 })

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/v1/media/sign?key=${encodeURIComponent(msg.mediaUrl)}`, {
      headers: { Authorization: `Bearer ${ORCHESTRATOR_API_KEY}` },
    })
    if (!res.ok) return NextResponse.json({ error: "Failed to resolve media" }, { status: 502 })
    const { url } = await res.json()
    if (!url) return NextResponse.json({ error: "Failed to resolve media" }, { status: 502 })
    return NextResponse.redirect(url)
  } catch (error) {
    console.error("[GET /api/conversations/:id/media/:messageId]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
