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
    totalConversations,
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
    db.conversationLog.count(),
    db.customer.count(),
    db.lead.count(),
    db.newsletterSubscriber.count(),
    db.user.count({ where: { agents: { some: {} } } }),
  ])

  // ── Plan distribution ────────────────────────────────────────────────────
  const planGroups = await db.user.groupBy({
    by: ["plan"],
    _count: { id: true },
  })
  const planData = planGroups.map((g) => ({ plan: g.plan, count: g._count.id }))

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
  ])

  const creditsAllTime = Number(creditsAllTimeRaw[0]?.total ?? 0)
  const creditsMonthly = Number(creditsMonthlyRaw[0]?.total ?? 0)

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
      _count: { select: { agents: true, leads: true } },
      agents: {
        select: {
          id: true,
          status: true,
          agentRuntime: true,
          _count: { select: { conversationLogs: true, customers: true } },
        },
      },
    },
  })

  const userMetrics = users.map((u) => {
    const conversations = u.agents.reduce((s, a) => s + a._count.conversationLogs, 0)
    const contacts = u.agents.reduce((s, a) => s + a._count.customers, 0)
    const dzeroAgents = u.agents.filter((a) => a.agentRuntime === "orchestrator")
    const dzeroConversations = dzeroAgents.reduce((s, a) => s + a._count.conversationLogs, 0)
    const dzeroContacts = dzeroAgents.reduce((s, a) => s + a._count.customers, 0)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      plan: u.plan,
      createdAt: u.createdAt.toISOString(),
      agents: u._count.agents,
      leads: u._count.leads,
      conversations,
      contacts,
      credits: userCreditsMap[u.id] ?? 0,
      dzeroAgentCount: dzeroAgents.length,
      dzeroConversations,
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
          <span className={styles.statLabel}>Total Conversations</span>
          <span className={styles.statNum}>{totalConversations.toLocaleString()}</span>
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
