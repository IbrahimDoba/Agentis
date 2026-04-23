import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { baileysClient } from "@/lib/baileys-client"

export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { agentId } = await params
  const status = await baileysClient.getSession(agentId)
  if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(status)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { agentId } = await params
  try {
    await baileysClient.deleteSession(agentId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
