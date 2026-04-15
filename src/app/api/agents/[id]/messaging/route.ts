import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { listWhatsAppAccounts, setWhatsAppAccountAgent } from "@/lib/elevenlabs"

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { enabled } = await req.json()

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 })
  }

  const agent = await db.agent.findUnique({
    where: { id },
    select: { userId: true, elevenlabsAgentId: true, whatsappPhoneNumberId: true },
  })

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const isOwner = agent.userId === session.user.id
  const isAdmin = session.user.role === "ADMIN"
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!agent.elevenlabsAgentId) {
    return NextResponse.json({ error: "No ElevenLabs agent connected" }, { status: 400 })
  }

  try {
    // Resolve phone_number_id — use stored value or fetch from ElevenLabs
    let phoneNumberId = agent.whatsappPhoneNumberId

    if (!phoneNumberId) {
      const accounts = await listWhatsAppAccounts()
      const match = accounts.find((a) => a.assigned_agent_id === agent.elevenlabsAgentId)
      if (!match) {
        return NextResponse.json({ error: "No WhatsApp account found for this agent" }, { status: 404 })
      }
      phoneNumberId = match.phone_number_id

      // Store it for future calls
      await db.agent.update({
        where: { id },
        data: { whatsappPhoneNumberId: phoneNumberId },
      })
    }

    // enabled=true → assign agent back, enabled=false → set null (messages ignored)
    await setWhatsAppAccountAgent(phoneNumberId, enabled ? agent.elevenlabsAgentId : null)

    // Persist state
    const updated = await db.agent.update({
      where: { id },
      data: { messagingEnabled: enabled },
      select: { messagingEnabled: true },
    })

    return NextResponse.json({ messagingEnabled: updated.messagingEnabled })
  } catch (err) {
    const message = err instanceof Error ? err.message : "ElevenLabs error"
    console.error("[messaging] Failed:", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
