import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getElevenLabsAgent, updateAgentKnowledgeBase } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string; docId: string }>
}

// DELETE — detach a doc from the agent's knowledge base
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id, docId } = await params
    const agent = await db.agent.findUnique({ where: { id }, select: { userId: true, elevenlabsAgentId: true } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!agent.elevenlabsAgentId) {
      return NextResponse.json({ error: "Agent setup is not complete yet" }, { status: 400 })
    }

    // Get current KB, remove the doc, patch agent
    const elAgent = await getElevenLabsAgent(agent.elevenlabsAgentId)
    const currentKB: { id: string; name: string; type: string; usage_mode: string }[] =
      elAgent?.conversation_config?.agent?.prompt?.knowledge_base ?? []

    const updatedKB = currentKB.filter((doc) => doc.id !== docId)
    await updateAgentKnowledgeBase(agent.elevenlabsAgentId, updatedKB)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[DELETE /api/agents/:id/knowledge-base/:docId]", error)
    return NextResponse.json({ error: "Failed to remove document" }, { status: 500 })
  }
}
