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

  const campaign = await db.followUpCampaign.findFirst({ where: { id: campaignId, agentId } })
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  if (["completed", "cancelled"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign already finished" }, { status: 400 })
  }

  // Tell worker to stop sending if it was running
  if (campaign.status === "sending") {
    await baileysClient.cancelFollowUpCampaign(campaignId).catch(() => {})
  }

  await db.followUpCampaign.update({
    where: { id: campaignId },
    data: { status: "cancelled", completedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
