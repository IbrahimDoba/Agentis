import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K } from "@/lib/plans"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const user = await db.user.findUnique({
    where: { id },
    select: { plan: true, subscriptionExpiresAt: true },
  })

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const agents = await db.agent.findMany({
    where: { userId: id },
    select: {
      id: true,
      businessName: true,
      status: true,
      messagingEnabled: true,
      agentRuntime: true,
      transportType: true,
      whatsappPhoneNumber: true,
      whatsappPhoneNumberId: true,
      whatsappAgentLink: true,
    },
  })

  const agentIds = agents.map((a) => a.id)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Credit usage breakdown by messageType for this month
  const monthlyByType = agentIds.length
    ? await db.$queryRawUnsafe<Array<{ messageType: string; total: number }>>(
        `SELECT "messageType", COALESCE(SUM("creditsUsed"), 0)::int as total
         FROM "CreditUsage"
         WHERE "agentId" = ANY($1::text[])
           AND "createdAt" >= $2::timestamptz
           AND "createdAt" < $3::timestamptz
         GROUP BY "messageType"`,
        agentIds,
        monthStart.toISOString(),
        monthEnd.toISOString()
      )
    : []

  // Per-agent credit usage this month
  const monthlyPerAgent = agentIds.length
    ? await db.$queryRawUnsafe<Array<{ agentId: string; total: number }>>(
        `SELECT "agentId", COALESCE(SUM("creditsUsed"), 0)::int as total
         FROM "CreditUsage"
         WHERE "agentId" = ANY($1::text[])
           AND "createdAt" >= $2::timestamptz
           AND "createdAt" < $3::timestamptz
         GROUP BY "agentId"`,
        agentIds,
        monthStart.toISOString(),
        monthEnd.toISOString()
      )
    : []

  // All-time total credits
  const totalAgg = agentIds.length
    ? await db.$queryRawUnsafe<Array<{ total: number }>>(
        `SELECT COALESCE(SUM("creditsUsed"), 0)::int as total
         FROM "CreditUsage"
         WHERE "agentId" = ANY($1::text[])`,
        agentIds
      )
    : [{ total: 0 }]

  // Voice credits from ConversationLog (legacy ElevenLabs)
  const voiceMonthly = agentIds.length
    ? await db.conversationLog.aggregate({
        where: {
          agentId: { in: agentIds },
          OR: [
            { startTime: { gte: monthStart, lt: monthEnd } },
            { startTime: null, createdAt: { gte: monthStart, lt: monthEnd } },
          ],
        },
        _sum: { creditsUsed: true },
      })
    : null

  // Conversation count per agent
  const convCounts = agentIds.length
    ? await db.conversation.groupBy({
        by: ["agentId"],
        where: { agentId: { in: agentIds } },
        _count: { _all: true },
      })
    : []

  // Build breakdown map
  const typeMap: Record<string, number> = {}
  for (const row of monthlyByType) {
    typeMap[row.messageType] = Number(row.total)
  }

  const agentMap: Record<string, number> = {}
  for (const row of monthlyPerAgent) {
    agentMap[row.agentId] = Number(row.total)
  }

  const convMap: Record<string, number> = {}
  for (const row of convCounts) {
    convMap[row.agentId] = row._count._all
  }

  const voiceCredits = voiceMonthly?._sum?.creditsUsed ?? 0
  const orchestratorMonthly = Object.values(agentMap).reduce((a, b) => a + b, 0)
  const monthlyCreditsUsed = orchestratorMonthly + voiceCredits
  const totalCreditsUsed = Number(totalAgg[0]?.total ?? 0)

  const plan = user.plan ?? "free"
  const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free
  const overageCredits = creditLimit === -1 ? 0 : Math.max(0, monthlyCreditsUsed - creditLimit)
  const overageRate = PLAN_OVERAGE_RATE_PER_1K[plan] ?? null
  const overageChargeNaira =
    overageRate !== null && overageCredits > 0
      ? Math.ceil(overageCredits / 1000) * overageRate
      : null
  const subscriptionExpired = user.subscriptionExpiresAt
    ? new Date() > user.subscriptionExpiresAt
    : false

  return NextResponse.json({
    plan,
    creditLimit,
    monthlyCreditsUsed,
    totalCreditsUsed,
    overageCredits,
    overageChargeNaira,
    subscriptionExpired,
    monthlyBreakdown: {
      text: Number(typeMap["text"] ?? 0),
      image: Number(typeMap["image"] ?? 0),
      voice: voiceCredits,
    },
    agentBreakdown: agents.map((a) => ({
      id: a.id,
      businessName: a.businessName,
      runtime: a.agentRuntime,
      transportType: a.transportType,
      monthlyCredits: agentMap[a.id] ?? 0,
      conversationCount: convMap[a.id] ?? 0,
    })),
    agents: agents.map((a) => ({
      id: a.id,
      status: a.status,
      messagingEnabled: a.messagingEnabled,
      businessName: a.businessName,
      whatsappPhoneNumber: a.whatsappPhoneNumber ?? null,
      whatsappPhoneNumberId: a.whatsappPhoneNumberId ?? null,
      whatsappAgentLink: a.whatsappAgentLink ?? null,
    })),
  })
}
