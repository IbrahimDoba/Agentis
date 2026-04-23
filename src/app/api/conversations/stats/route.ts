import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { PLAN_CREDIT_LIMITS } from "@/lib/plans"
import { getWorkspaceContext } from "@/lib/workspace"
import { sumCreditsForAgents } from "@/lib/creditUsage"

type RuntimeView = "orchestrator" | "elevenlabs"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const runtime = (req.nextUrl.searchParams.get("runtime") ?? "orchestrator") as RuntimeView
  const agentId = req.nextUrl.searchParams.get("agentId")

  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: { plan: true, subscriptionExpiresAt: true },
  })

  // Current calendar month window
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const runtimeAgents = await db.agent.findMany({
    where: {
      userId: ownerId,
      ...(runtime === "orchestrator"
        ? { agentRuntime: "orchestrator" }
        : { OR: [{ agentRuntime: "elevenlabs" }, { elevenlabsAgentId: { not: null } }] }),
      ...(agentId ? { id: agentId } : {}),
    },
    select: { id: true, elevenlabsAgentId: true },
  })

  const runtimeAgentIds = runtimeAgents.map((a) => a.id)
  const elevenLabsIds = runtimeAgents.map((a) => a.elevenlabsAgentId).filter((id): id is string => !!id)

  let totalConversations = 0
  let totalLeads = 0
  let totalContacts = 0
  let totalCreditsUsed = 0
  let monthlyCreditsUsed = 0

  if (runtime === "orchestrator") {
    if (runtimeAgentIds.length > 0) {
      const [convCount, leadCount, contacts, creditsTotal, creditsMonthly] = await Promise.all([
        db.conversation.count({ where: { agentId: { in: runtimeAgentIds } } }),
        db.lead.count({ where: { userId: ownerId, agentId: { in: runtimeAgentIds } } }),
        db.conversation.groupBy({
          by: ["phoneNumber"],
          where: { agentId: { in: runtimeAgentIds }, phoneNumber: { not: "" } },
        }),
        sumCreditsForAgents(runtimeAgentIds),
        sumCreditsForAgents(runtimeAgentIds, monthStart, monthEnd),
      ])
      totalConversations = convCount
      totalLeads = leadCount
      totalContacts = contacts.length
      totalCreditsUsed = creditsTotal
      monthlyCreditsUsed = creditsMonthly
    }
  } else {
    if (runtimeAgentIds.length > 0 || elevenLabsIds.length > 0) {
      const logFilter = {
        OR: [
          ...(runtimeAgentIds.length > 0 ? [{ agentId: { in: runtimeAgentIds } }] : []),
          ...(elevenLabsIds.length > 0 ? [{ elevenlabsAgentId: { in: elevenLabsIds } }] : []),
        ],
      }

      const [convCount, leadCount, contacts, creditsAgg, monthlyCreditsAgg] = await Promise.all([
        db.conversationLog.count({ where: logFilter }),
        db.lead.count({ where: { userId: ownerId, agentId: { in: runtimeAgentIds } } }),
        db.conversationLog.groupBy({
          by: ["phoneNumber"],
          where: { ...logFilter, phoneNumber: { not: null } },
        }),
        db.conversationLog.aggregate({ where: logFilter, _sum: { creditsUsed: true } }),
        db.conversationLog.aggregate({
          where: { ...logFilter, createdAt: { gte: monthStart, lt: monthEnd } },
          _sum: { creditsUsed: true },
        }),
      ])

      totalConversations = convCount
      totalLeads = leadCount
      totalContacts = contacts.length
      totalCreditsUsed = creditsAgg?._sum?.creditsUsed ?? 0
      monthlyCreditsUsed = monthlyCreditsAgg?._sum?.creditsUsed ?? 0
    }
  }

  const plan = user?.plan ?? "free"
  const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free

  return NextResponse.json({
    runtime,
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
