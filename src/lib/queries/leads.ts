import type { PrismaClient } from "@/generated/prisma/client"

// Lead list reads. The GET /api/leads handler previously made synchronous
// ElevenLabs API calls (one per lead missing a caller number) on the read
// path — slow and called even by the chats views that don't use the number.
// Split into a pure DB read (used everywhere) and opt-in enrichment (only the
// leads page asks for it).

export interface LeadWithAgent {
  id: string
  conversationId: string
  agentId: string
  userId: string
  callerNumber: string | null
  summary: string | null
  status: string
  notes: string | null
  aiDetected: boolean
  createdAt: Date
  updatedAt: Date
  agent: {
    businessName: string
    profileImageUrl: string | null
    elevenlabsAgentId: string | null
  }
}

/**
 * Pure DB read: all leads for a user, with caller numbers filled from the
 * stored lead row or the ConversationLog. No external API calls.
 */
export async function getLeadsForUser(
  db: Pick<PrismaClient, "lead" | "conversationLog">,
  ownerId: string
): Promise<LeadWithAgent[]> {
  const leads = await db.lead.findMany({
    where: { userId: ownerId },
    include: {
      agent: {
        select: { businessName: true, profileImageUrl: true, elevenlabsAgentId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Backfill missing numbers from ConversationLog in a single query.
  const missingIds = leads.filter((l) => !l.callerNumber).map((l) => l.conversationId)
  const logs = missingIds.length
    ? await db.conversationLog.findMany({
        where: { conversationId: { in: missingIds } },
        select: { conversationId: true, phoneNumber: true },
      })
    : []
  const phoneFromLog = new Map(logs.map((l) => [l.conversationId, l.phoneNumber]))

  return leads.map((l) => ({
    ...l,
    callerNumber: l.callerNumber || phoneFromLog.get(l.conversationId) || null,
  }))
}
