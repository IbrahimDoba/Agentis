import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"

interface Params {
  params: Promise<{ id: string }>
}

async function assertAccess(agentId: string, userId: string, role?: string) {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  })

  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) }
  }

  if (agent.userId !== userId && role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  const session = await db.baileysSession.findUnique({
    where: { agentId },
    select: { agentId: true },
  })

  if (!session) {
    return { error: NextResponse.json({ error: "No WhatsApp Web session found for this agent" }, { status: 400 }) }
  }

  return { agent }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const access = await assertAccess(id, session.user.id, session.user.role)
    if ("error" in access) return access.error

    const data = await baileysClient.listBroadcasts(id)
    return NextResponse.json(data)
  } catch (error) {
    console.error("[GET /api/agents/:id/broadcasts]", error)
    return NextResponse.json({ error: "Failed to fetch broadcasts" }, { status: 502 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const access = await assertAccess(id, session.user.id, session.user.role)
    if ("error" in access) return access.error

    const body = await req.json()
    const message = typeof body.message === "string" ? body.message : ""
    const phoneNumbers = Array.isArray(body.phoneNumbers)
      ? body.phoneNumbers.filter((value: unknown): value is string => typeof value === "string")
      : []

    if (!message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    if (phoneNumbers.length === 0) {
      return NextResponse.json({ error: "Select at least one existing contact" }, { status: 400 })
    }

    const data = await baileysClient.createBroadcast({
      agentId: id,
      message: message.trim(),
      phoneNumbers,
    })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agents/:id/broadcasts]", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create broadcast" }, { status: 502 })
  }
}
