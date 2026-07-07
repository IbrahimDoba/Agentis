import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { PLAN_CREDIT_LIMITS, effectiveCreditLimit } from "@/lib/plans"
import { getWorkspaceContext } from "@/lib/workspace"
import { sumCreditsForAgents, sumCreditsBySourceForAgents } from "@/lib/creditUsage"
import { getBillingPeriod } from "@/lib/billing-period"
import { cachedJson } from "@/lib/cache"

type RuntimeView = "orchestrator" | "elevenlabs"
type StatsRange = "7d" | "1m" | "6m" | "1y" | "all"

const VALID_RANGES: ReadonlySet<StatsRange> = new Set(["7d", "1m", "6m", "1y", "all"])

function rangeStart(range: StatsRange): Date | null {
  if (range === "all") return null
  const now = new Date()
  const d = new Date(now)
  switch (range) {
    case "7d": d.setDate(d.getDate() - 7); break
    case "1m": d.setMonth(d.getMonth() - 1); break
    case "6m": d.setMonth(d.getMonth() - 6); break
    case "1y": d.setFullYear(d.getFullYear() - 1); break
  }
  return d
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { ownerId } = await getWorkspaceContext(session.user.id)
  const runtime = (req.nextUrl.searchParams.get("runtime") ?? "orchestrator") as RuntimeView
  const agentId = req.nextUrl.searchParams.get("agentId")
  const rangeParam = req.nextUrl.searchParams.get("range") as StatsRange | null
  const range: StatsRange = rangeParam && VALID_RANGES.has(rangeParam) ? rangeParam : "all"

  // Cached briefly (15s). This endpoint runs ~7 aggregates and is polled roughly
  // every 30s per open dashboard tab, so N tabs = an aggregate storm without it.
  // Keyed by owner+runtime+range+agent so tenants never share a cache line; the
  // short TTL bounds staleness of the live credit/usage numbers. cachedJson is
  // best-effort — with no Redis it just runs the loader (correctness unchanged).
  const cacheKey = `stats:${ownerId}:${runtime}:${range}:${agentId ?? "all"}`
  const payload = await cachedJson(cacheKey, 15, async () => {
    const since = rangeStart(range)

    const user = await db.user.findUnique({
      where: { id: ownerId },
      select: { plan: true, subscriptionExpiresAt: true, creditBalance: true, creditsExpireAt: true, resellerId: true, carryoverCredits: true, carryoverExpiresAt: true },
    })

    const { start: monthStart, end: monthEnd } = getBillingPeriod(user?.subscriptionExpiresAt)

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
    let totalAiMessages = 0
    let totalLeads = 0
    let totalContacts = 0
    let totalCreditsUsed = 0
    let monthlyCreditsUsed = 0
    let monthlyAiCredits = 0
    let monthlyHumanCredits = 0

    // The 4 stat cards (conversations, AI messages, leads, contacts) are
    // scoped by `range` via createdAt. Credits stay tied to the billing
    // period — those drive the plan/overage UI and shouldn't move with
    // the cards' selector.
    const createdAtFilter = since ? { gte: since } : undefined

    if (runtime === "orchestrator") {
      if (runtimeAgentIds.length > 0) {
        const [convCount, aiMsgCount, leadCount, contacts, creditsTotal, creditsMonthly, creditsBreakdown] = await Promise.all([
          db.conversation.count({
            where: {
              agentId: { in: runtimeAgentIds },
              ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
            },
          }),
          db.message.count({
            where: {
              direction: "outbound",
              senderRole: "ai",
              conversation: { agentId: { in: runtimeAgentIds } },
              ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
            },
          }),
          db.lead.count({
            where: {
              userId: ownerId,
              agentId: { in: runtimeAgentIds },
              ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
            },
          }),
          db.conversation.groupBy({
            by: ["phoneNumber"],
            where: {
              agentId: { in: runtimeAgentIds },
              phoneNumber: { not: "" },
              ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
            },
          }),
          sumCreditsForAgents(runtimeAgentIds),
          sumCreditsForAgents(runtimeAgentIds, monthStart, monthEnd),
          sumCreditsBySourceForAgents(runtimeAgentIds, monthStart, monthEnd),
        ])
        totalConversations = convCount
        totalAiMessages = aiMsgCount
        totalLeads = leadCount
        totalContacts = contacts.length
        totalCreditsUsed = creditsTotal
        monthlyCreditsUsed = creditsMonthly
        monthlyAiCredits = creditsBreakdown.ai
        monthlyHumanCredits = creditsBreakdown.human
      }
    } else {
      if (runtimeAgentIds.length > 0 || elevenLabsIds.length > 0) {
        const logFilter = {
          OR: [
            ...(runtimeAgentIds.length > 0 ? [{ agentId: { in: runtimeAgentIds } }] : []),
            ...(elevenLabsIds.length > 0 ? [{ elevenlabsAgentId: { in: elevenLabsIds } }] : []),
          ],
        }
        const rangedLogFilter = createdAtFilter
          ? { ...logFilter, createdAt: createdAtFilter }
          : logFilter

        const [convCount, leadCount, contacts, creditsAgg, monthlyCreditsAgg] = await Promise.all([
          db.conversationLog.count({ where: rangedLogFilter }),
          db.lead.count({
            where: {
              userId: ownerId,
              agentId: { in: runtimeAgentIds },
              ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
            },
          }),
          db.conversationLog.groupBy({
            by: ["phoneNumber"],
            where: { ...rangedLogFilter, phoneNumber: { not: null } },
          }),
          db.conversationLog.aggregate({ where: logFilter, _sum: { creditsUsed: true } }),
          db.conversationLog.aggregate({
            where: { ...logFilter, createdAt: { gte: monthStart, lt: monthEnd } },
            _sum: { creditsUsed: true },
          }),
        ])

        totalConversations = convCount
        totalAiMessages = convCount
        totalLeads = leadCount
        totalContacts = contacts.length
        totalCreditsUsed = creditsAgg?._sum?.creditsUsed ?? 0
        monthlyCreditsUsed = monthlyCreditsAgg?._sum?.creditsUsed ?? 0
      }
    }

    const plan = user?.plan ?? "free"
    const creditLimit = effectiveCreditLimit(
      PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free,
      user?.carryoverCredits,
      user?.carryoverExpiresAt
    )

    return {
      runtime,
      range,
      totalConversations,
      totalAiMessages,
      totalLeads,
      totalContacts,
      totalCreditsUsed,
      monthlyCreditsUsed,
      monthlyAiCredits,
      monthlyHumanCredits,
      creditLimit,
      plan,
      subscriptionExpiresAt: user?.subscriptionExpiresAt?.toISOString() ?? null,
      // Reseller-tenant users run on a pool-granted wallet (not a plan allowance),
      // so surface the wallet balance + a reseller flag for their read-only plan UI.
      creditBalance: user?.creditBalance ?? 0,
      creditsExpireAt: user?.creditsExpireAt?.toISOString() ?? null,
      isReseller: (user?.resellerId ?? "platform") !== "platform",
    }
  })

  return NextResponse.json(payload)
}
