import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversations } from "@/lib/elevenlabs"
import { getWorkspaceContext } from "@/lib/workspace"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { ownerId } = await getWorkspaceContext(session.user.id)

    const agent = await db.agent.findFirst({
      where: { userId: ownerId },
    })

    if (!agent) {
      return NextResponse.json({ error: "No agent found" }, { status: 404 })
    }

    if (!agent.elevenlabsAgentId) {
      return NextResponse.json({ conversations: [] })
    }

    const data = await getConversations(agent.elevenlabsAgentId)
    return NextResponse.json(data)
  } catch (error) {
    console.error("[GET /api/chats]", error)
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 })
  }
}
