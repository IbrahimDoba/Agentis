import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; broadcastId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id, broadcastId } = await params
    const agent = await db.agent.findUnique({ where: { id }, select: { userId: true } })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const waSession = await db.baileysSession.findUnique({ where: { agentId: id }, select: { agentId: true } })
    if (!waSession) {
      return NextResponse.json({ error: "No WhatsApp Web session found for this agent" }, { status: 400 })
    }

    await baileysClient.cancelBroadcast(broadcastId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[POST /api/agents/:id/broadcasts/:broadcastId/cancel]", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to cancel broadcast" }, { status: 502 })
  }
}
