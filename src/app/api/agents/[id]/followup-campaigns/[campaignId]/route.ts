import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext } from "@/lib/workspace"

interface Params { params: Promise<{ id: string; campaignId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId, campaignId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const campaign = await db.followUpCampaign.findFirst({
    where: { id: campaignId, agentId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  return NextResponse.json({ campaign })
}
