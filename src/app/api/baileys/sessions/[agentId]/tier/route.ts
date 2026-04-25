import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { baileysClient } from "@/lib/baileys-client"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { agentId } = await params
  const { tier } = await req.json()
  if (!tier || tier < 1 || tier > 4) {
    return NextResponse.json({ error: "tier must be 1–4" }, { status: 400 })
  }

  try {
    await baileysClient.updateTier(agentId, tier)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH tier] error", { agentId, tier, err: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
