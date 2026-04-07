import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getElevenLabsAgent } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params

    const agent = await db.agent.findUnique({ where: { id }, select: { userId: true, elevenlabsAgentId: true } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!agent.elevenlabsAgentId) {
      return NextResponse.json({ systemPrompt: null, connected: false })
    }

    const elAgent = await getElevenLabsAgent(agent.elevenlabsAgentId)
    const systemPrompt = elAgent?.conversation_config?.agent?.prompt?.prompt ?? null

    return NextResponse.json({ systemPrompt, connected: true })
  } catch (error) {
    console.error("[GET /api/agents/:id/system-prompt]", error)
    return NextResponse.json({ error: "Failed to fetch system prompt" }, { status: 500 })
  }
}
