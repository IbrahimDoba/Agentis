import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K } from "@/lib/plans"
import { sumCreditsForAgents } from "@/lib/creditUsage"

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

  // All agents for this user
  const agents = await db.agent.findMany({
    where: { userId: id },
    select: { id: true, elevenlabsAgentId: true, messagingEnabled: true, status: true, businessName: true, whatsappPhoneNumber: true, whatsappPhoneNumberId: true, whatsappAgentLink: true },
  })

  const agentIds = agents.map((a) => a.id)

  // Current calendar month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [monthlyAgg, totalAgg, orchestratorMonthly, orchestratorTotal] = await Promise.all([
    agentIds.length
      ? db.conversationLog.aggregate({
          where: {
            agentId: { in: agentIds },
            OR: [
              { startTime: { gte: monthStart, lt: monthEnd } },
              { startTime: null, createdAt: { gte: monthStart, lt: monthEnd } },
            ],
          },
          _sum: { creditsUsed: true },
        })
      : null,
    agentIds.length
      ? db.conversationLog.aggregate({
          where: { agentId: { in: agentIds } },
          _sum: { creditsUsed: true },
        })
      : null,
    sumCreditsForAgents(agentIds, monthStart, monthEnd),
    sumCreditsForAgents(agentIds),
  ])

  const plan = user.plan ?? "free"
  const monthlyCreditsUsed = (monthlyAgg?._sum?.creditsUsed ?? 0) + orchestratorMonthly
  const totalCreditsUsed = (totalAgg?._sum?.creditsUsed ?? 0) + orchestratorTotal
  const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free
  const overageCredits = creditLimit === -1 ? 0 : Math.max(0, monthlyCreditsUsed - creditLimit)
  const overageRate = PLAN_OVERAGE_RATE_PER_1K[plan] ?? null
  const overageChargeNaira = overageRate !== null && overageCredits > 0
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
