import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"

function normalizePhone(raw: string): string | null {
  const jidMatch = raw.match(/^(\d+)[:@]/)
  const cleaned = jidMatch ? jidMatch[1] : raw.replace(/\D/g, "")
  return cleaned.length >= 7 ? cleaned : null
}

function extractPhone(conv: Record<string, unknown>): string | null {
  const meta = conv.metadata as Record<string, unknown> | undefined
  if (meta) {
    const candidates = [
      meta.from_number as string,
      meta.caller_id as string,
      (meta.phone_call as Record<string, string> | undefined)?.external_number,
      (meta.phone_call as Record<string, string> | undefined)?.from,
      meta.initiator_identifier as string,
    ]
    for (const c of candidates) {
      if (c) {
        const n = normalizePhone(c)
        if (n) return n
      }
    }
  }
  if (conv.user_id) {
    const n = normalizePhone(conv.user_id as string)
    if (n) return n
  }
  return null
}

// GET /api/leads — all leads for the current user
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const leads = await db.lead.findMany({
    where: { userId: session.user.id },
    include: {
      agent: { select: { businessName: true, profileImageUrl: true, elevenlabsAgentId: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // Fill missing callerNumbers from ConversationLog
  const missingIds = leads
    .filter((l) => !l.callerNumber)
    .map((l) => l.conversationId)

  const logs = missingIds.length
    ? await db.conversationLog.findMany({
        where: { conversationId: { in: missingIds } },
        select: { conversationId: true, phoneNumber: true },
      })
    : []

  const phoneMap = new Map(logs.map((l) => [l.conversationId, l.phoneNumber]))

  // For leads still missing a number, try fetching from ElevenLabs
  const stillMissing = missingIds.filter((id) => !phoneMap.get(id))
  if (stillMissing.length > 0 && process.env.ELEVENLABS_API_KEY) {
    const fetches = stillMissing.map(async (convId) => {
      try {
        const res = await fetch(`${ELEVENLABS_BASE}/convai/conversations/${convId}`, {
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
        })
        if (!res.ok) return
        const data = await res.json()
        const phone = extractPhone(data)
        if (phone) {
          phoneMap.set(convId, phone)
          // Persist so we don't have to fetch again
          db.lead.updateMany({
            where: { conversationId: convId, callerNumber: null },
            data: { callerNumber: phone },
          }).catch(() => {})
        }
      } catch { /* skip */ }
    })
    await Promise.all(fetches)
  }

  const enriched = leads.map((l) => ({
    ...l,
    callerNumber: l.callerNumber || phoneMap.get(l.conversationId) || null,
    agent: { businessName: l.agent.businessName, profileImageUrl: l.agent.profileImageUrl },
  }))

  return NextResponse.json({ leads: enriched })
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
