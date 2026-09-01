import { NextResponse } from "next/server"
import { requireAgentAccess } from "@/lib/agentAccess"
import { baileysClient } from "@/lib/baileys-client"

export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const access = await requireAgentAccess(agentId)
  if (!access.ok) {
    return access.reason === "UNAUTHENTICATED"
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const status = await baileysClient.getSession(agentId)
  if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(status)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const access = await requireAgentAccess(agentId)
  if (!access.ok) {
    return access.reason === "UNAUTHENTICATED"
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    await baileysClient.deleteSession(agentId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
