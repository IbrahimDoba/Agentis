import { db } from "@/lib/db"
import { PLAN_CREDIT_LIMITS, PLAN_OVERAGE_RATE_PER_1K } from "@/lib/plans"
import { sumCreditsForAgents } from "@/lib/creditUsage"

/**
 * Checks whether an agent should be disabled (subscription expired or monthly
 * credits exceeded) and updates the messagingEnabled DB flag accordingly.
 *
 * Does NOT physically unlink the WhatsApp account — the agent stays linked so
 * the pre-call webhook can still fire and return a polite "unavailable" message
 * to customers instead of silent no-response.
 *
 * Physical unlinking is only done by the admin manual toggle
 * (PATCH /api/agents/:id/messaging).
 *
 * Safe to call fire-and-forget — logs errors internally.
 */
export async function checkAndEnforceAgentLimit(agentId: string): Promise<void> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      elevenlabsAgentId: true,
      whatsappPhoneNumberId: true,
      messagingEnabled: true,
      status: true,
      user: {
        select: {
          plan: true,
          subscriptionExpiresAt: true,
        },
      },
    },
  })

  // Only enforce on active, fully-configured agents
  if (!agent) return
  if (agent.status !== "ACTIVE") return

  const { plan, subscriptionExpiresAt } = agent.user
  const overageAllowed = (PLAN_OVERAGE_RATE_PER_1K[plan] ?? null) !== null

  // Check 1: Subscription period expired
  const subscriptionExpired = subscriptionExpiresAt ? new Date() > subscriptionExpiresAt : false

  // Check 2: Monthly credit limit exceeded
  const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? 0
  let creditsExceeded = false

  if (creditLimit !== -1) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const used = agent.elevenlabsAgentId
      ? (await db.conversationLog.aggregate({
          where: {
            agentId: agent.id,
            OR: [
              { startTime: { gte: monthStart, lt: monthEnd } },
              { startTime: null, createdAt: { gte: monthStart, lt: monthEnd } },
            ],
          },
          _sum: { creditsUsed: true },
        }))._sum.creditsUsed ?? 0
      : await sumCreditsForAgents([agent.id], monthStart, monthEnd)
    creditsExceeded = used >= creditLimit
    console.log(`[agentLimit] Agent ${agentId}: used=${used}, limit=${creditLimit}, exceeded=${creditsExceeded}`)
  }

  const shouldDisable = subscriptionExpired || (creditsExceeded && !overageAllowed)

  if (shouldDisable && agent.messagingEnabled) {
    try {
      await db.agent.update({ where: { id: agentId }, data: { messagingEnabled: false } })
      console.log(`[agentLimit] ❌ Flagged agent ${agentId} as disabled — subscriptionExpired=${subscriptionExpired}, creditsExceeded=${creditsExceeded}`)
    } catch (err) {
      console.error(`[agentLimit] Failed to disable agent ${agentId}:`, err)
    }
  } else if (!shouldDisable && !agent.messagingEnabled) {
    try {
      await db.agent.update({ where: { id: agentId }, data: { messagingEnabled: true } })
      console.log(`[agentLimit] ✅ Re-enabled agent ${agentId}`)
    } catch (err) {
      console.error(`[agentLimit] Failed to re-enable agent ${agentId}:`, err)
    }
  }
}

/**
 * Runs the limit check for all active agents belonging to a user.
 * Call this after a plan upgrade or subscription renewal.
 */
export async function checkAndEnforceUserAgentLimits(userId: string): Promise<void> {
  const agents = await db.agent.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true },
  })
  await Promise.all(agents.map((a) => checkAndEnforceAgentLimit(a.id)))
}
