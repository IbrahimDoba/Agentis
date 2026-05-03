import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { runFollowUpScan } from "@/lib/followup-scanner"
import { getWorkspaceContext } from "@/lib/workspace"

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const campaigns = await db.followUpCampaign.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { messages: true } } },
  })

  return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const mode: "auto" | "review" = body.mode === "review" ? "review" : "auto"
  const minDaysSince: number = Math.max(1, Number(body.minDaysSince) || 1)

  // Create the campaign record immediately
  const campaign = await db.followUpCampaign.create({
    data: { agentId, mode, minDaysSince, status: "scanning" },
  })

  // Run scan async — do not await, let the client poll for status
  runFollowUpScan({ agentId, campaignId: campaign.id, minDaysSince }).catch(async (err) => {
    console.error("[followup-scan] error:", err)
    await db.followUpCampaign.update({
      where: { id: campaign.id },
      data: { status: "failed" },
    }).catch(() => {})
  })

  return NextResponse.json({ campaign }, { status: 201 })
}
