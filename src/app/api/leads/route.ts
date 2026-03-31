import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/leads — all leads for the current user
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const leads = await db.lead.findMany({
    where: { userId: session.user.id },
    include: { agent: { select: { businessName: true, profileImageUrl: true } } },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ leads })
}

// POST /api/leads — create or toggle a lead
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { conversationId, agentId, callerNumber, summary, aiDetected = false } = body

  if (!conversationId || !agentId) {
    return NextResponse.json({ error: "conversationId and agentId are required" }, { status: 400 })
  }

  // Verify agent belongs to user
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true } })
  if (!agent || agent.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Toggle: if already a lead, remove it
  const existing = await db.lead.findUnique({
    where: { conversationId_userId: { conversationId, userId: session.user.id } },
  })

  if (existing) {
    await db.lead.delete({ where: { id: existing.id } })
    return NextResponse.json({ lead: null, removed: true })
  }

  const lead = await db.lead.create({
    data: {
      id: Math.random().toString(36).slice(2, 12),
      conversationId,
      agentId,
      userId: session.user.id,
      callerNumber: callerNumber ?? null,
      summary: summary ?? null,
      aiDetected,
    },
  })

  return NextResponse.json({ lead, removed: false })
}
