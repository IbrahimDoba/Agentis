import { NextResponse } from "next/server"
import { requireAgentAccess } from "@/lib/agentAccess"
import { baileysClient } from "@/lib/baileys-client"

export async function POST(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const access = await requireAgentAccess(agentId)
  if (!access.ok) {
    return access.reason === "UNAUTHENTICATED"
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    await baileysClient.restartSession(agentId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
