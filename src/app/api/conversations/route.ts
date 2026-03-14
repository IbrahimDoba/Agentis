import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversations } from "@/lib/elevenlabs"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const agent = await db.agent.findFirst({
    where: { userId: session.user.id },
  })

  if (!agent?.elevenlabsAgentId) {
    return NextResponse.json({ conversations: [], has_more: false })
  }

  try {
    const data = await getConversations(agent.elevenlabsAgentId)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 502 })
  }
}
