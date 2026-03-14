import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getConversation } from "@/lib/elevenlabs"
import { NextResponse } from "next/server"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Verify the user owns an agent connected to ElevenLabs
  const agent = await db.agent.findFirst({
    where: { userId: session.user.id },
  })

  if (!agent?.elevenlabsAgentId) {
    return NextResponse.json({ error: "No active agent" }, { status: 403 })
  }

  try {
    const data = await getConversation(id)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Failed to fetch conversation" }, { status: 502 })
  }
}
