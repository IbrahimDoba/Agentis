import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse, after } from "next/server"
import { runFollowUpScan } from "@/lib/followup-scanner"
import { getWorkspaceContext } from "@/lib/workspace"

interface Params { params: Promise<{ id: string }> }

// Give the async scan room to finish AFTER the response (via after()) instead
// of being frozen the instant we return — the root cause of campaigns stuck
// forever on "scanning". Vercel clamps this to the plan's max.
export const maxDuration = 300

// A campaign that's been "scanning" longer than this never will finish (the
// serverless run that owned it is long gone) — surface it as failed so the UI
// recovers and the operator can retry, instead of spinning indefinitely.
const STUCK_SCAN_MS = 10 * 60 * 1000

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: agentId } = await params
  const { ownerId } = await getWorkspaceContext(session.user.id)

  const agent = await db.agent.findFirst({ where: { id: agentId, userId: ownerId } })
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Watchdog: recover any campaign wedged on "scanning" (its serverless run died
  // mid-scan). Marking it failed lets the panel stop spinning and offer a retry.
  await db.followUpCampaign.updateMany({
    where: { agentId, status: "scanning", createdAt: { lt: new Date(Date.now() - STUCK_SCAN_MS) } },
    data: { status: "failed" },
  }).catch(() => {})

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
  const includeAll: boolean = body.includeAll === true
  // "Message everyone" always goes to review — the operator decides who gets sent.
  const mode: "auto" | "review" = includeAll
    ? "review"
    : body.mode === "review" ? "review" : "auto"
  const minDaysSince: number = Math.max(1, Number(body.minDaysSince) || 1)
  const targetLabelId: string | undefined = typeof body.targetLabelId === "string" && body.targetLabelId ? body.targetLabelId : undefined
  const targetLabelName: string | undefined = typeof body.targetLabelName === "string" && body.targetLabelName ? body.targetLabelName : undefined

  // Create the campaign record immediately
  const campaign = await db.followUpCampaign.create({
    data: { agentId, mode, minDaysSince, status: "scanning", targetLabelId, targetLabelName },
  })

  // Run the scan AFTER the response is sent — after() keeps the serverless
  // function alive for it (up to maxDuration), instead of the platform freezing
  // execution the moment we return and killing an un-awaited promise (which is
  // why scans got stuck on "scanning"). The client polls the campaign status.
  after(async () => {
    try {
      await runFollowUpScan({ agentId, campaignId: campaign.id, minDaysSince, includeAll, targetLabelId })
    } catch (err) {
      console.error("[followup-scan] error:", err)
      await db.followUpCampaign.update({
        where: { id: campaign.id },
        data: { status: "failed" },
      }).catch(() => {})
    }
  })

  return NextResponse.json({ campaign }, { status: 201 })
}
