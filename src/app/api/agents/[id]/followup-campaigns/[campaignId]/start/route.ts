import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext } from "@/lib/workspace"
import { baileysClient } from "@/lib/baileys-client"

interface Params { params: Promise<{ id: string; campaignId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId, campaignId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const campaign = await db.followUpCampaign.findFirst({
    where: { id: campaignId, agentId },
    include: { messages: { where: { status: { in: ["pending", "approved"] } } } },
  })
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  if (!["review", "scheduled"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign cannot be started in its current state" }, { status: 400 })
  }

  // In auto mode, approve all pending; in review mode, reject leftover pending
  let toSend = campaign.messages.filter((m) => m.status === "approved")
  if (campaign.mode === "auto") {
    await db.followUpMessage.updateMany({
      where: { campaignId, status: "pending" },
      data: { status: "approved" },
    })
    toSend = campaign.messages // all of them (now all approved)
  } else {
    // Review mode: any message the user didn't explicitly approve gets skipped
    await db.followUpMessage.updateMany({
      where: { campaignId, status: "pending" },
      data: { status: "rejected" },
    })
  }

  if (toSend.length === 0) {
    await db.followUpCampaign.update({
      where: { id: campaignId },
      data: { status: "completed", completedAt: new Date() },
    })
    return NextResponse.json({ ok: true, sent: 0 })
  }

  // Hand off to the worker to schedule + send
  await baileysClient.startFollowUpCampaign(campaignId, agentId)

  await db.followUpCampaign.update({
    where: { id: campaignId },
    data: { status: "sending", startedAt: new Date() },
  })

  return NextResponse.json({ ok: true, total: toSend.length })
}
