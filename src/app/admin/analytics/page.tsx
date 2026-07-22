import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { AnalyticsCharts } from "@/components/admin/AnalyticsCharts"
import { UserMetricsTable } from "@/components/admin/UserMetricsTable"

export default async function AdminAnalyticsPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  // ── Site-wide stats ──────────────────────────────────────────────────────
  const [
    totalUsers,
    approvedUsers,
    pendingUsers,
    totalAgents,
    activeAgents,
    totalAiSent,
    totalContacts,
    totalLeads,
    subscriberCount,
    usersWithAgents,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: "APPROVED" } }),
    db.user.count({ where: { status: "PENDING" } }),
    db.agent.count(),
    db.agent.count({ where: { status: "ACTIVE" } }),
    // AI messages actually sent (outbound, sender = ai) — the real "sent" metric.
    db.message.count({ where: { direction: "outbound", senderRole: "ai" } }),
    // Contacts = distinct people agents have talked to = one Conversation per (agent, phone).
    db.conversation.count(),
    db.lead.count(),
    db.newsletterSubscriber.count(),
    db.user.count({ where: { agents: { some: {} } } }),
  ])

  // ── Plans & billing states ───────────────────────────────────────────────
  // Not just the raw plan string: a user whose plan lapsed but who is running
  // on PAYG wallet credits shows as "payg", and a lapsed user with no usable
  // wallet shows as "expired" — matching how the worker's send gate actually
  // treats them. Resellers are their own bucket.
  const billingGroups = await db.$queryRawUnsafe<Array<{ segment: string; count: number }>>(
    `SELECT CASE
       WHEN "plan" = 'reseller' THEN 'reseller'
       WHEN "subscriptionExpiresAt" IS NOT NULL AND "subscriptionExpiresAt" < now()
            AND "creditBalance" > 0 AND ("creditsExpireAt" IS NULL OR "creditsExpireAt" > now())
         THEN 'payg'
       WHEN "subscriptionExpiresAt" IS NOT NULL AND "subscriptionExpiresAt" < now()
         THEN 'expired'
       ELSE "plan"
     END AS segment, COUNT(*)::int AS count
     FROM "User"
     GROUP BY 1`
  )
  const planData = billingGroups.map((g) => ({ plan: g.segment, count: Number(g.count) }))

  // ── Agent status distribution ────────────────────────────────────────────
  const agentStatusGroups = await db.agent.groupBy({
    by: ["status"],
    _count: { id: true },
  })
  const agentStatusData = agentStatusGroups.map((g) => ({ status: g.status, count: g._count.id }))

  // ── User growth by month (last 6 months) ────────────────────────────────
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  const recentUsers = await db.user.findMany({
    where: { createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  // Group by month label
  const monthMap: Record<string, number> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" })
    monthMap[key] = 0
  }
  for (const u of recentUsers) {
    const key = u.createdAt.toLocaleString("default", { month: "short", year: "2-digit" })
    if (key in monthMap) monthMap[key]++
  }
  const userGrowthData = Object.entries(monthMap).map(([month, count]) => ({ month, count }))

  // ── Conversations by month (last 6 months) ───────────────────────────────
  const recentConvs = await db.conversationLog.findMany({
    where: { createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  const convMonthMap: Record<string, number> = {}
  for (const key of Object.keys(monthMap)) convMonthMap[key] = 0
  for (const c of recentConvs) {
    const key = c.createdAt.toLocaleString("default", { month: "short", year: "2-digit" })
    if (key in convMonthMap) convMonthMap[key]++
  }
  const convGrowthData = Object.entries(convMonthMap).map(([month, count]) => ({ month, count }))

  // ── Orchestrator / credits stats ─────────────────────────────────────────
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const [
    orchestratorAgentCount,
    orchestratorConvCount,
    creditsAllTimeRaw,
    creditsMonthlyRaw,
    dailyCreditsRaw,
    userCreditsRaw,
    userAiSentRaw,
  ] = await Promise.all([
    db.agent.count({ where: { agentRuntime: "orchestrator" } }),
    db.conversation.count({ where: { agent: { agentRuntime: "orchestrator" } } }),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM("creditsUsed"), 0)::int as total FROM "CreditUsage"`
    ),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM("creditsUsed"), 0)::int as total FROM "CreditUsage" WHERE "createdAt" >= $1::timestamptz`,
      monthStart.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ day: string; total: number }>>(
      `SELECT DATE("createdAt") as day, COALESCE(SUM("creditsUsed"), 0)::int as total
       FROM "CreditUsage"
       WHERE "createdAt" >= $1::timestamptz
       GROUP BY DATE("createdAt")
       ORDER BY day ASC`,
      thirtyDaysAgo.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ userId: string; total: number }>>(
      `SELECT a."userId", COALESCE(SUM(cu."creditsUsed"), 0)::int as total
       FROM "CreditUsage" cu
       JOIN "Agent" a ON cu."agentId" = a."id"
       GROUP BY a."userId"`
    ),
    // AI-sent messages per user (outbound, sender = ai).
    db.$queryRawUnsafe<Array<{ userId: string; total: number }>>(
      `SELECT a."userId", COUNT(*)::int as total
       FROM "Message" m
       JOIN "Conversation" c ON m."conversationId" = c."id"
       JOIN "Agent" a ON c."agentId" = a."id"
       WHERE m."direction" = 'outbound' AND m."senderRole" = 'ai'
       GROUP BY a."userId"`
    ),
  ])

  const creditsAllTime = Number(creditsAllTimeRaw[0]?.total ?? 0)
  const creditsMonthly = Number(creditsMonthlyRaw[0]?.total ?? 0)

  // ── July-era platform pulse: PAYG economics + reliability ────────────────
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const twoDaysAgo = new Date(now); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const [
    aborts7d,
    aborts30d,
    bans30d,
    churn48h,
    fleetGroups,
    paygPurchase30d,
    walletOutstandingRaw,
    walletBurn30dRaw,
    walletHoldersRaw,
  ] = await Promise.all([
    db.workerEvent.count({ where: { category: "ai.reply_aborted", createdAt: { gte: sevenDaysAgo } } }),
    db.workerEvent.count({ where: { category: "ai.reply_aborted", createdAt: { gte: thirtyDaysAgo } } }),
    db.workerEvent.count({ where: { category: "session.banned", createdAt: { gte: thirtyDaysAgo } } }),
    db.workerEvent.count({ where: { category: "session.closed", createdAt: { gte: twoDaysAgo } } }),
    db.baileysSession.groupBy({ by: ["status"], _count: { id: true } }),
    db.creditPurchase.aggregate({
      where: { status: "PAID", createdAt: { gte: thirtyDaysAgo } },
      _sum: { amountNaira: true, creditsAdded: true },
      _count: { id: true },
    }),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM("creditBalance"), 0)::int AS total FROM "User"
       WHERE "creditBalance" > 0 AND ("creditsExpireAt" IS NULL OR "creditsExpireAt" > now())`
    ),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM("creditsUsed"), 0)::int AS total FROM "CreditUsage"
       WHERE "billedTo" = 'wallet' AND "createdAt" >= $1::timestamptz`,
      thirtyDaysAgo.toISOString()
    ),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total FROM "User"
       WHERE "creditBalance" > 0 AND ("creditsExpireAt" IS NULL OR "creditsExpireAt" > now())`
    ),
  ])
  const fleet: Record<string, number> = {}
  for (const g of fleetGroups) fleet[g.status] = g._count.id
  const walletOutstanding = Number(walletOutstandingRaw[0]?.total ?? 0)
  const walletBurn30d = Number(walletBurn30dRaw[0]?.total ?? 0)
  const walletHolders = Number(walletHoldersRaw[0]?.total ?? 0)
  const paygRevenue30d = paygPurchase30d._sum.amountNaira ?? 0
  const paygCreditsSold30d = paygPurchase30d._sum.creditsAdded ?? 0
  const paygTopUps30d = paygPurchase30d._count.id

  // Fill in missing days with 0
  const dailyMap: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dailyMap[d.toISOString().split("T")[0]] = 0
  }
  for (const row of dailyCreditsRaw as Array<{ day: string; total: number }>) {
    const key = typeof row.day === "string" ? row.day.split("T")[0] : new Date(row.day).toISOString().split("T")[0]
    if (key in dailyMap) dailyMap[key] = Number(row.total)
  }
  const dailyCreditsData = Object.entries(dailyMap).map(([day, total]) => ({
    day: new Date(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    total,
  }))

  const userCreditsMap: Record<string, number> = {}
  for (const row of userCreditsRaw as Array<{ userId: string; total: number }>) {
    userCreditsMap[row.userId] = Number(row.total)
  }

  const userAiSentMap: Record<string, number> = {}
  for (const row of userAiSentRaw as Array<{ userId: string; total: number }>) {
    userAiSentMap[row.userId] = Number(row.total)
  }

  // ── Per-user metrics ─────────────────────────────────────────────────────
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      plan: true,
      createdAt: true,
      creditBalance: true,
      creditsExpireAt: true,
      subscriptionExpiresAt: true,
      _count: { select: { agents: true, leads: true } },
      agents: {
        select: {
          id: true,
          status: true,
          agentRuntime: true,
          _count: { select: { conversations: true } },
        },
      },
    },
  })

  const userMetrics = users.map((u) => {
    // Contacts = distinct people (one Conversation per agent+phone).
    const contacts = u.agents.reduce((s, a) => s + a._count.conversations, 0)
    // "AI sent" = outbound messages the AI sent. Messages live on Conversations,
    // which only the orchestrator creates — so the per-user total IS the DZero total.
    const aiSent = userAiSentMap[u.id] ?? 0
    const dzeroAgents = u.agents.filter((a) => a.agentRuntime === "orchestrator")
    const dzeroContacts = dzeroAgents.reduce((s, a) => s + a._count.conversations, 0)
    // Wallet + PAYG state (mirrors the billing-segment query above): a lapsed
    // plan funded by a usable wallet = running on pay-as-you-go.
    const walletUsable = (u.creditBalance ?? 0) > 0 && (!u.creditsExpireAt || u.creditsExpireAt > now)
    const lapsed = !!u.subscriptionExpiresAt && u.subscriptionExpiresAt < now
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      plan: u.plan,
      createdAt: u.createdAt.toISOString(),
      agents: u._count.agents,
      leads: u._count.leads,
      conversations: aiSent,
      contacts,
      credits: userCreditsMap[u.id] ?? 0,
      walletBalance: walletUsable ? u.creditBalance : 0,
      payg: u.plan !== "reseller" && lapsed && walletUsable,
      dzeroAgentCount: dzeroAgents.length,
      dzeroConversations: aiSent,
      dzeroContacts,
    }
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Analytics</h1>
        <p className={styles.subtitle}>Platform usage, user metrics, and growth</p>
      </div>

      {/* Site-wide stat cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Users</span>
          <span className={styles.statNum}>{totalUsers}</span>
          <span className={styles.statSub}>{approvedUsers} approved · {pendingUsers} pending</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Users with Agents</span>
          <span className={styles.statNum}>{usersWithAgents}</span>
          <span className={styles.statSub}>{totalAgents} total · {activeAgents} active</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>AI Messages Sent</span>
          <span className={styles.statNum}>{totalAiSent.toLocaleString()}</span>
          <span className={styles.statSub}>{creditsAllTime.toLocaleString()} credits used</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Contacts</span>
          <span className={styles.statNum}>{totalContacts.toLocaleString()}</span>
          <span className={styles.statSub}>{totalLeads} leads generated</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Newsletter Subscribers</span>
          <span className={styles.statNum}>{subscriberCount}</span>
          <span className={styles.statSub}>Footer sign-ups</span>
        </div>
      </div>

      {/* Orchestrator / Credits stat cards */}
      <h2 className={styles.sectionTitle} style={{ marginBottom: "1rem" }}>AI Chat (Orchestrator)</h2>
      <div className={styles.statsGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "2rem" }}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>AI Chat Agents</span>
          <span className={styles.statNum}>{orchestratorAgentCount}</span>
          <span className={styles.statSub}>Orchestrator runtime</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>AI Conversations</span>
          <span className={styles.statNum}>{orchestratorConvCount.toLocaleString()}</span>
          <span className={styles.statSub}>All time</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Credits This Month</span>
          <span className={styles.statNum}>{creditsMonthly.toLocaleString()}</span>
          <span className={styles.statSub}>Text + image AI</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Credits All Time</span>
          <span className={styles.statNum}>{creditsAllTime.toLocaleString()}</span>
          <span className={styles.statSub}>Platform total</span>
        </div>
      </div>

      {/* Pay-as-you-go economics */}
      <h2 className={styles.sectionTitle} style={{ marginBottom: "1rem" }}>Pay-as-you-go (Wallet)</h2>
      <div className={styles.statsGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "2rem" }}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>PAYG Revenue (30d)</span>
          <span className={styles.statNum}>₦{paygRevenue30d.toLocaleString()}</span>
          <span className={styles.statSub}>{paygTopUps30d} top-up{paygTopUps30d === 1 ? "" : "s"} · {paygCreditsSold30d.toLocaleString()} credits sold</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Wallet Holders</span>
          <span className={styles.statNum}>{walletHolders}</span>
          <span className={styles.statSub}>users with spendable credits</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Credits Outstanding</span>
          <span className={styles.statNum}>{walletOutstanding.toLocaleString()}</span>
          <span className={styles.statSub}>unspent wallet balance (liability)</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Wallet Burn (30d)</span>
          <span className={styles.statNum}>{walletBurn30d.toLocaleString()}</span>
          <span className={styles.statSub}>credits billed to wallets</span>
        </div>
      </div>

      {/* Reliability & safety */}
      <h2 className={styles.sectionTitle} style={{ marginBottom: "1rem" }}>Reliability &amp; Safety</h2>
      <div className={styles.statsGrid} style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "2rem" }}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>WhatsApp Fleet</span>
          <span className={styles.statNum}>{fleet.CONNECTED ?? 0} live</span>
          <span className={styles.statSub}>
            {(fleet.DISCONNECTED ?? 0)} disconnected · {(fleet.BANNED ?? 0)} banned{fleet.QR_PENDING ? ` · ${fleet.QR_PENDING} linking` : ""}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Double-replies Avoided</span>
          <span className={styles.statNum}>{aborts30d.toLocaleString()}</span>
          <span className={styles.statSub}>last 30d · {aborts7d} this week (human-first aborts)</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Connection Drops (48h)</span>
          <span className={styles.statNum}>{churn48h.toLocaleString()}</span>
          <span className={styles.statSub}>auto-reconnected by the watchdogs</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Bans (30d)</span>
          <span className={styles.statNum}>{bans30d}</span>
          <span className={styles.statSub}>WhatsApp number bans</span>
        </div>
      </div>

      {/* Charts */}
      <AnalyticsCharts
        userGrowthData={userGrowthData}
        convGrowthData={convGrowthData}
        planData={planData}
        agentStatusData={agentStatusData}
        dailyCreditsData={dailyCreditsData}
      />

      {/* Per-user metrics table */}
      <div className={styles.tableSection}>
        <h2 className={styles.sectionTitle}>Per-User Resource Usage</h2>
        <UserMetricsTable users={userMetrics} />
      </div>
    </div>
  )
}
