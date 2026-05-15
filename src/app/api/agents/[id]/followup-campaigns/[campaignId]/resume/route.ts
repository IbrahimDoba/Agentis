import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext } from "@/lib/workspace"
import { baileysClient } from "@/lib/baileys-client"

interface Params { params: Promise<{ id: string; campaignId: string }> }

// Bring a paused/failed campaign back to life. The worker handles the heavy
// lifting (status flips + re-enqueue); this route validates ownership and
// the campaign's current state, then delegates.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: agentId, campaignId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const campaign = await db.followUpCampaign.findFirst({
    where: { id: campaignId, agentId },
    select: { id: true, status: true },
  })
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  // Only failed campaigns can be resumed. Cancelled is a deliberate user
  // action — they have to start a new campaign if they change their mind.
  // Completed campaigns have nothing to retry.
  if (campaign.status !== "failed") {
    return NextResponse.json(
      { error: `Cannot resume a campaign in '${campaign.status}' state. Only failed campaigns can be resumed.` },
      { status: 400 }
    )
  }

  try {
    const result = await baileysClient.resumeFollowUpCampaign(campaignId, agentId)
    return NextResponse.json({ ok: true, requeued: result.requeued })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Resume failed"
    console.error("[resume follow-up campaign]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
