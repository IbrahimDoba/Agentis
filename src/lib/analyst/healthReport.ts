import { db } from "@/lib/db"
import { PLAN_CREDIT_LIMITS, effectiveCreditLimit, PLAN_LABELS } from "@/lib/plans"
import { getBillingPeriod } from "@/lib/billing-period"
import { hasUsableWallet, paygTakeover } from "@/lib/walletStatus"
import { sumCreditsForUser } from "@/lib/creditUsage"
import { scoreBanRisk, type BanRisk } from "./banRisk"

// The AI Analyst's fact base. Everything here is COMPUTED from the DB — the
// LLM only narrates these facts, so the analyst can't hallucinate an account
// state. Keep every field cheap to gather; the API route caches the result.

export interface AgentHealth {
  agentId: string
  name: string
  sessionStatus: string // CONNECTED | DISCONNECTED | QR_PENDING | BANNED | none
  lastDisconnectReason: string | null
  needsRelink: boolean // not CONNECTED and not intentionally stopped
  banned: boolean
  warmupTier: number | null
  linkedDays: number | null // days since session created
  disconnects48h: number
  aiReplies7d: number
  aborts7d: number
}

export interface AnalystFacts {
  generatedAt: string
  plan: { id: string; label: string }
  billing: {
    subscriptionExpiresAt: string | null
    subscriptionExpired: boolean
    usedThisCycle: number
    effectiveLimit: number // -1 unlimited
    planRemaining: number | null
    walletBalance: number
    walletUsable: boolean
    walletExpiresAt: string | null
    paygActive: boolean
    blockedNow: boolean // AI sends are being refused for billing reasons
    blockReason: string | null
    dailyBurn7d: number // avg credits/day over last 7d
    projectedRunoutDays: number | null // (planRemaining + wallet) / dailyBurn
  }
  week: {
    inbound7d: number
    aiReplies7d: number
    humanReplies7d: number
    leads7d: number
    aborts7d: number
    activeConversations7d: number
  }
  agents: AgentHealth[]
  banRisk: BanRisk
}

const DAY = 24 * 60 * 60 * 1000

export async function gatherAnalystFacts(ownerId: string): Promise<AnalystFacts | null> {
  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: {
      plan: true, subscriptionExpiresAt: true, currentPeriodStart: true, creditBalance: true, creditsExpireAt: true,
      carryoverCredits: true, carryoverExpiresAt: true,
    },
  })
  if (!user) return null

  const agents = await db.agent.findMany({
    where: { userId: ownerId },
    select: {
      id: true, businessName: true,
      baileysSession: {
        select: { status: true, lastDisconnectReason: true, createdAt: true, warmupTier: true },
      },
    },
  })
  const agentIds = agents.map((a) => a.id)
  const now = Date.now()
  const d7 = new Date(now - 7 * DAY)
  const d14 = new Date(now - 14 * DAY)
  const d2 = new Date(now - 2 * DAY)

  // ---- billing ----
  const plan = user.plan ?? "free"
  const baseLimit = PLAN_CREDIT_LIMITS[plan] ?? PLAN_CREDIT_LIMITS.free
  const limit = effectiveCreditLimit(baseLimit, user.carryoverCredits ?? 0, user.carryoverExpiresAt)
  const { start, end } = getBillingPeriod(user.subscriptionExpiresAt, user.currentPeriodStart)
  const usedThisCycle = agentIds.length ? await sumCreditsForUser(ownerId, start, end) : 0
  const used7d = agentIds.length ? await sumCreditsForUser(ownerId, d7, new Date(now)) : 0
  const subscriptionExpired = user.subscriptionExpiresAt ? new Date() > user.subscriptionExpiresAt : false
  const walletUsable = hasUsableWallet(user.creditBalance, user.creditsExpireAt)
  const planRemaining = limit === -1 ? null : Math.max(0, limit - usedThisCycle)
  const planExhausted = limit !== -1 && (limit <= 0 || usedThisCycle >= limit)
  const paygActive = paygTakeover({
    creditBalance: user.creditBalance,
    creditsExpireAt: user.creditsExpireAt,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    monthlyCreditsUsed: usedThisCycle,
    creditLimit: limit,
  })
  // Mirrors the worker's send gate: expired or exhausted with no usable wallet = refused.
  const blockedNow = (subscriptionExpired || planExhausted) && !walletUsable && limit !== -1
  const blockReason = blockedNow
    ? subscriptionExpired
      ? "Plan/trial has expired and the wallet is empty — AI replies are paused"
      : "Monthly credits are finished and the wallet is empty — AI replies are paused"
    : null
  const dailyBurn7d = Math.round(used7d / 7)
  const spendable = (planRemaining ?? 0) + (walletUsable ? user.creditBalance : 0)
  const projectedRunoutDays = dailyBurn7d > 0 && limit !== -1 ? Math.floor(spendable / dailyBurn7d) : null

  // ---- weekly performance ----
  const [inbound7d, aiReplies7d, humanReplies7d, leads7d, activeConversations7d] = agentIds.length
    ? await Promise.all([
        db.message.count({ where: { direction: "inbound", createdAt: { gte: d7 }, conversation: { agentId: { in: agentIds } } } }),
        db.message.count({ where: { direction: "outbound", senderRole: "ai", createdAt: { gte: d7 }, conversation: { agentId: { in: agentIds } } } }),
        db.message.count({ where: { direction: "outbound", senderRole: "human", createdAt: { gte: d7 }, conversation: { agentId: { in: agentIds } } } }),
        db.lead.count({ where: { userId: ownerId, createdAt: { gte: d7 } } }),
        db.conversation.count({ where: { agentId: { in: agentIds }, lastActivityAt: { gte: d7 } } }),
      ])
    : [0, 0, 0, 0, 0]

  // ---- per-agent events (48h disconnects, 7d aborts) + per-agent AI replies ----
  const events = agentIds.length
    ? await db.workerEvent.groupBy({
        by: ["agentId", "category"],
        where: { agentId: { in: agentIds }, createdAt: { gte: d7 }, category: { in: ["session.closed", "ai.reply_aborted", "session.banned"] } },
        _count: { _all: true },
      })
    : []
  const closed48hRows = agentIds.length
    ? await db.workerEvent.groupBy({
        by: ["agentId"],
        where: { agentId: { in: agentIds }, createdAt: { gte: d2 }, category: "session.closed" },
        _count: { _all: true },
      })
    : []
  const aiPerAgent = agentIds.length
    ? await db.message.groupBy({
        by: ["conversationId"],
        where: { direction: "outbound", senderRole: "ai", createdAt: { gte: d7 }, conversation: { agentId: { in: agentIds } } },
        _count: { _all: true },
      })
    : []
  // conversationId -> agentId map for the per-agent rollup
  const convAgent = aiPerAgent.length
    ? await db.conversation.findMany({ where: { id: { in: aiPerAgent.map((r) => r.conversationId) } }, select: { id: true, agentId: true } })
    : []
  const convToAgent = new Map(convAgent.map((c) => [c.id, c.agentId]))
  const aiByAgent = new Map<string, number>()
  for (const r of aiPerAgent) {
    const aid = convToAgent.get(r.conversationId)
    if (aid) aiByAgent.set(aid, (aiByAgent.get(aid) ?? 0) + r._count._all)
  }
  const evCount = (aid: string, cat: string) => events.find((e) => e.agentId === aid && e.category === cat)?._count._all ?? 0
  const closed48h = (aid: string) => closed48hRows.find((e) => e.agentId === aid)?._count._all ?? 0

  const INTENTIONAL = new Set(["user_disconnect", "logged_out", "QR refs attempts ended"])
  const agentHealth: AgentHealth[] = agents.map((a) => {
    const s = a.baileysSession
    const status = s?.status ?? "none"
    return {
      agentId: a.id,
      name: a.businessName,
      sessionStatus: status,
      lastDisconnectReason: s?.lastDisconnectReason ?? null,
      needsRelink: status !== "CONNECTED" && status !== "none" && !INTENTIONAL.has(s?.lastDisconnectReason ?? ""),
      banned: status === "BANNED",
      warmupTier: s?.warmupTier ?? null,
      linkedDays: s ? Math.floor((now - new Date(s.createdAt).getTime()) / DAY) : null,
      disconnects48h: closed48h(a.id),
      aiReplies7d: aiByAgent.get(a.id) ?? 0,
      aborts7d: evCount(a.id, "ai.reply_aborted"),
    }
  })

  // ---- ban-risk inputs ----
  const broadcasts = agentIds.length
    ? await db.broadcastCampaign.findMany({
        where: { agentId: { in: agentIds }, createdAt: { gte: d14 } },
        select: { message: true, totalCount: true, failedCount: true, createdAt: true },
      })
    : []
  const followups = agentIds.length
    ? await db.followUpCampaign.aggregate({
        where: { agentId: { in: agentIds }, createdAt: { gte: d14 } },
        _sum: { totalSent: true },
      })
    : { _sum: { totalSent: 0 } }
  const coldRows = agentIds.length
    ? await db.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n
         FROM "Conversation" c
         LEFT JOIN LATERAL (
           SELECT direction FROM "Message" m WHERE m."conversationId" = c.id ORDER BY m."createdAt" ASC LIMIT 1
         ) fm ON true
         WHERE c."agentId" = ANY($1::text[]) AND c."createdAt" > $2::timestamptz AND fm.direction = 'outbound'`,
        agentIds,
        d7.toISOString()
      )
    : [{ n: 0 }]
  const priorBans = agentIds.length
    ? await db.workerEvent.count({ where: { agentId: { in: agentIds }, category: "session.banned" } })
    : 0
  const linkedSessions = agentHealth.filter((a) => a.linkedDays !== null)
  const youngest = linkedSessions.length ? linkedSessions.reduce((m, a) => Math.min(m, a.linkedDays!), Infinity) : null
  const youngestAgent = youngest !== null ? agentHealth.find((a) => a.linkedDays === youngest) : undefined

  const banRisk = scoreBanRisk({
    broadcasts14d: broadcasts.map((b) => ({
      recipients: b.totalCount,
      message: b.message,
      failedRatio: b.totalCount > 0 ? b.failedCount / b.totalCount : 0,
      daysAgo: Math.floor((now - new Date(b.createdAt).getTime()) / DAY),
    })),
    followupSent14d: followups._sum.totalSent ?? 0,
    coldFirstConversations7d: Number(coldRows[0]?.n ?? 0),
    youngestSessionAgeDays: youngest === Infinity ? null : youngest,
    warmupTier: youngestAgent?.warmupTier ?? null,
    disconnects48h: agentHealth.reduce((s, a) => s + a.disconnects48h, 0),
    priorBans: priorBans > 0 ? 1 : 0,
  })

  return {
    generatedAt: new Date().toISOString(),
    plan: { id: plan, label: PLAN_LABELS[plan] ?? plan },
    billing: {
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      subscriptionExpired,
      usedThisCycle,
      effectiveLimit: limit,
      planRemaining,
      walletBalance: user.creditBalance ?? 0,
      walletUsable,
      walletExpiresAt: user.creditsExpireAt?.toISOString() ?? null,
      paygActive,
      blockedNow,
      blockReason,
      dailyBurn7d,
      projectedRunoutDays,
    },
    week: {
      inbound7d,
      aiReplies7d,
      humanReplies7d,
      leads7d,
      aborts7d: agentHealth.reduce((s, a) => s + a.aborts7d, 0),
      activeConversations7d,
    },
    agents: agentHealth,
    banRisk,
  }
}
