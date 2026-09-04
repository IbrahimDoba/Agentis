import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import { isFreeTrialExpired } from "@/lib/trial"

interface Params {
  params: Promise<{ id: string }>
}

async function assertAccess(agentId: string, userId: string, role?: string) {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      userId: true,
      user: { select: { plan: true, resellerId: true, subscriptionExpiresAt: true, creditBalance: true, creditsExpireAt: true } },
    },
  })

  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) }
  }

  if (agent.userId !== userId && role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  // Free-trial wall: an expired platform free user can't start broadcasts.
  if (isFreeTrialExpired(agent.user)) {
    return { error: NextResponse.json({ error: "Your free trial has ended — choose a plan to keep sending." }, { status: 402 }) }
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

    // Cloud API campaigns must name an approved template: free-form text
    // outside the 24-hour service window is rejected by Meta, not merely
    // undelivered. The number decides whose credentials the send uses.
    const channel = body.channel === "meta" ? "meta" : "whatsapp"
    const templateName = typeof body.templateName === "string" ? body.templateName.trim() : ""
    const templateLanguage =
      typeof body.templateLanguage === "string" ? body.templateLanguage.trim() : "en_US"
    const metaPhoneNumberId =
      typeof body.metaPhoneNumberId === "string" ? body.metaPhoneNumberId : ""

    if (channel === "meta" && (!templateName || !metaPhoneNumberId)) {
      return NextResponse.json(
        { error: "A Meta broadcast needs an approved template and a connected number" },
        { status: 400 }
      )
    }
    const phoneNumbers = Array.isArray(body.phoneNumbers)
      ? body.phoneNumbers.filter((value: unknown): value is string => typeof value === "string")
      : []

    if (channel !== "meta" && !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    if (phoneNumbers.length === 0) {
      return NextResponse.json({ error: "Select at least one existing contact" }, { status: 400 })
    }

    // Optional send window (hours) to spread the campaign over, capped at 168h
    // (7 days). The 24h floor applies to real broadcasts; a list of
    // SMALL_LIST_MAX_RECIPIENTS or fewer may compress it, including 0 for "as
    // soon as the anti-ban gap allows". Kept in step with the same rule in
    // worker/src/queue/broadcast-queue.ts.
    const SMALL_LIST_MAX_RECIPIENTS = 10
    let spreadHours: number | undefined
    if (body.spreadHours !== undefined && body.spreadHours !== null) {
      const n = Math.floor(Number(body.spreadHours))
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "Send window must be zero or more hours" }, { status: 400 })
      }
      if (n < 24 && phoneNumbers.length > SMALL_LIST_MAX_RECIPIENTS) {
        return NextResponse.json(
          {
            error: `A send window under 24 hours is only allowed for ${SMALL_LIST_MAX_RECIPIENTS} recipients or fewer. You selected ${phoneNumbers.length}.`,
          },
          { status: 400 }
        )
      }
      spreadHours = Math.min(168, n)
    }

    const data = await baileysClient.createBroadcast({
      agentId: id,
      message: message.trim(),
      channel,
      ...(channel === "meta"
        ? { metaPhoneNumberId, templateName, templateLanguage }
        : {}),
      phoneNumbers,
      ...(spreadHours !== undefined ? { spreadHours } : {}),
    })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("[POST /api/agents/:id/broadcasts]", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create broadcast" }, { status: 502 })
  }
}
