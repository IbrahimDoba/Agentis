import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext } from "@/lib/workspace"

interface Params { params: Promise<{ id: string; campaignId: string }> }

// POST /api/agents/:id/followup-campaigns/:campaignId/approve
// Body:
//   { action?: 'approve'|'reject'|'pending', messageIds?: string[] }
//   action defaults to 'approve'
//   no messageIds = apply to all pending (approve) or all approved (reject/pending)
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId, campaignId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const campaign = await db.followUpCampaign.findFirst({ where: { id: campaignId, agentId } })
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  if (campaign.status !== "review") return NextResponse.json({ error: "Campaign is not in review state" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const action: string = body.action ?? "approve"
  const messageIds: string[] | undefined = body.messageIds

  if (action === "approve") {
    if (messageIds && messageIds.length > 0) {
      await db.followUpMessage.updateMany({
        where: { campaignId, id: { in: messageIds }, status: "pending" },
        data: { status: "approved" },
      })
    } else {
      await db.followUpMessage.updateMany({
        where: { campaignId, status: "pending" },
        data: { status: "approved" },
      })
    }
  } else if (action === "reject") {
    if (messageIds && messageIds.length > 0) {
      await db.followUpMessage.updateMany({
        where: { campaignId, id: { in: messageIds } },
        data: { status: "rejected" },
      })
    }
  } else if (action === "pending") {
    // Unapprove — revert approved messages back to pending
    if (messageIds && messageIds.length > 0) {
      await db.followUpMessage.updateMany({
        where: { campaignId, id: { in: messageIds }, status: "approved" },
        data: { status: "pending" },
      })
    } else {
      await db.followUpMessage.updateMany({
        where: { campaignId, status: "approved" },
        data: { status: "pending" },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
