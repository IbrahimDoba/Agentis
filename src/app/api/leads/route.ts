import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getWorkspaceContext } from "@/lib/workspace"
import { getLeadsForUser } from "@/lib/queries/leads"

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

// GET /api/leads — all leads for the current user.
//
// Pure DB read by default (lead rows + ConversationLog backfill). The chats
// views poll this only for conversationId/agentId badging and don't need the
// caller number, so they get the fast path. The leads PAGE passes ?enrich=1
// to additionally resolve still-missing numbers from ElevenLabs (slow external
// calls, persisted so they only happen once per lead).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)

  const leads = await getLeadsForUser(db, ownerId)

  const shouldEnrich = req.nextUrl.searchParams.get("enrich") === "1"
  const extraPhones = new Map<string, string>()
  if (shouldEnrich && process.env.ELEVENLABS_API_KEY) {
    const stillMissing = leads.filter((l) => !l.callerNumber).map((l) => l.conversationId)
    await Promise.all(
      stillMissing.map(async (convId) => {
        try {
          const res = await fetch(`${ELEVENLABS_BASE}/convai/conversations/${convId}`, {
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          })
          if (!res.ok) return
          const phone = extractPhone(await res.json())
          if (phone) {
            extraPhones.set(convId, phone)
            // Persist so this lookup never has to happen again.
            db.lead
              .updateMany({
                where: { conversationId: convId, callerNumber: null },
                data: { callerNumber: phone },
              })
              .catch(() => {})
          }
        } catch {
          /* best-effort enrichment */
        }
      })
    )
  }

  const serialized = leads.map((l) => ({
    ...l,
    callerNumber: l.callerNumber || extraPhones.get(l.conversationId) || null,
    agent: { businessName: l.agent.businessName, profileImageUrl: l.agent.profileImageUrl },
  }))

  return NextResponse.json({ leads: serialized })
}

// POST /api/leads — create or toggle a lead
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)

  const body = await req.json()
  const { conversationId, agentId, callerNumber, summary, aiDetected = false } = body

  if (!conversationId || !agentId) {
    return NextResponse.json({ error: "conversationId and agentId are required" }, { status: 400 })
  }

  // Verify agent belongs to the active workspace owner
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true } })
  if (!agent || agent.userId !== ownerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Toggle: if already a lead, remove it
  const existing = await db.lead.findUnique({
    where: { conversationId_userId: { conversationId, userId: ownerId } },
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
      userId: ownerId,
      callerNumber: callerNumber ?? null,
      summary: summary ?? null,
      aiDetected,
    },
  })

  return NextResponse.json({ lead, removed: false })
}
