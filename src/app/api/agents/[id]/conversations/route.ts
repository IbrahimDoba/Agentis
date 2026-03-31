import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversations } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const isOwner = agent.userId === session.user.id
  const isAdmin = session.user.role === "ADMIN"
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!agent.elevenlabsAgentId) {
    return NextResponse.json({ conversations: [], has_more: false })
  }

  try {
    const data = await getConversations(agent.elevenlabsAgentId)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 502 })
  }
}
