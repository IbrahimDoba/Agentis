import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"
import { PLAN_CREDIT_LIMITS } from "@/lib/plans"
import { getWorkspaceContext } from "@/lib/workspace"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)

  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: { plan: true, subscriptionExpiresAt: true },
  })

  const agent = await db.agent.findFirst({
    where: { userId: ownerId },
    select: { id: true, elevenlabsAgentId: true },
  })

  const agentFilter = agent
    ? {
        OR: [
          { agentId: agent.id },
          ...(agent.elevenlabsAgentId ? [{ elevenlabsAgentId: agent.elevenlabsAgentId }] : []),
        ],
      }
    : null

  // Current calendar month window
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const monthFilter = agentFilter
    ? { ...agentFilter, createdAt: { gte: monthStart, lt: monthEnd } }
    : null

  const [totalConversations, totalLeads, totalContacts, creditsAgg, monthlyCreditsAgg] = await Promise.all([
    agentFilter ? db.conversationLog.count({ where: agentFilter }) : 0,
    db.lead.count({ where: { userId: ownerId } }),
    agentFilter
      ? db.conversationLog.groupBy({
          by: ["phoneNumber"],
          where: { ...agentFilter, phoneNumber: { not: null } },
        }).then((r) => r.length)
      : 0,
    agentFilter
      ? db.conversationLog.aggregate({ where: agentFilter, _sum: { creditsUsed: true } })
      : null,
    monthFilter
      ? db.conversationLog.aggregate({ where: monthFilter, _sum: { creditsUsed: true } })
      : null,
  ])

  const totalCreditsUsed = creditsAgg?._sum?.creditsUsed ?? 0
  const monthlyCreditsUsed = monthlyCreditsAgg?._sum?.creditsUsed ?? 0
  const plan = user?.plan ?? "free"
  const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free

  return NextResponse.json({
    totalConversations,
    totalLeads,
    totalContacts,
    totalCreditsUsed,
    monthlyCreditsUsed,
    creditLimit,
    plan,
    subscriptionExpiresAt: user?.subscriptionExpiresAt?.toISOString() ?? null,
  })
}
