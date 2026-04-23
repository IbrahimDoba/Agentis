import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { baileysClient } from "@/lib/baileys-client"

export async function POST(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { agentId } = await params
  try {
    await baileysClient.restartSession(agentId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
