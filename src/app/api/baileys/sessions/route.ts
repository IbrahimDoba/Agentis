import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { baileysClient } from "@/lib/baileys-client"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { agentId } = await req.json()
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 })

  try {
    const result = await baileysClient.createSession(agentId)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
