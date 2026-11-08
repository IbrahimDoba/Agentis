import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import styles from "./page.module.css"
import { formatDate } from "@/lib/utils"
import { BILLING_USER_SELECT, getCycleBillingForUsers } from "@/lib/adminUserUsage"

export default async function AdminPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [userCount, agentCount, pendingUsers, pendingAgents, activeAgents, orchestratorAgents, monthlyCreditsRaw] = await Promise.all([
    db.user.count(),
    db.agent.count(),
    db.user.count({ where: { status: "PENDING" } }),
    db.agent.count({ where: { status: "PENDING_REVIEW" } }),
    db.agent.count({ where: { status: "ACTIVE" } }),
    db.agent.count({ where: { agentRuntime: "orchestrator" } }),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM("creditsUsed"), 0)::int as total FROM "CreditUsage" WHERE "createdAt" >= $1::timestamptz`,
      monthStart.toISOString()
    ),
  ])

  const monthlyCreditsUsed = Number(monthlyCreditsRaw[0]?.total ?? 0)

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [billingUsers, connectedSessions, linkedSessions, statusPostsWeek, failedStatusWeek] = await Promise.all([
    db.user.findMany({ select: BILLING_USER_SELECT }),
    db.baileysSession.count({ where: { status: "CONNECTED" } }),
    db.baileysSession.count(),
    db.statusPost.count({ where: { status: "posted", postedAt: { gte: weekAgo } } }),
    db.statusPost.count({ where: { status: "failed", scheduledAt: { gte: weekAgo } } }),
  ])
  const billing = await getCycleBillingForUsers(billingUsers)
  let paygUsers = 0
  let overLimitUsers = 0
  for (const b of billing.values()) {
    if (b.state === "payg") paygUsers++
    else if (b.state === "over_limit") overLimitUsers++
  }

  const recentUsers = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { _count: { select: { agents: true } } },
  })

  const recentAgents = await db.agent.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { user: { select: { name: true, email: true } } },
  })

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Overview</h1>
        <p className={styles.subtitle}>{formatDate(new Date().toISOString())}</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Users</div>
          <div className={styles.statValue}>{userCount.toLocaleString()}</div>
          {pendingUsers > 0
            ? <Link href="/admin/users?status=PENDING" className={styles.statAlert}>{pendingUsers} pending approval</Link>
            : <div className={styles.statSub}>None waiting for approval</div>}
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Pay as you go</div>
          <div className={styles.statValue}>{paygUsers.toLocaleString()}</div>
          {overLimitUsers > 0
            ? <Link href="/admin/users?billing=over_limit" className={styles.statAlert}>{overLimitUsers} over the limit, no wallet</Link>
            : <div className={styles.statSub}>Paying from their wallet this cycle</div>}
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active agents</div>
          <div className={styles.statValue}>{activeAgents.toLocaleString()}</div>
          {pendingAgents > 0
            ? <Link href="/admin/agents" className={styles.statAlert}>{pendingAgents} pending review</Link>
            : <div className={styles.statSub}>{agentCount.toLocaleString()} total · {orchestratorAgents.toLocaleString()} AI chat</div>}
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>WhatsApp sessions</div>
          <div className={styles.statValue}>{connectedSessions.toLocaleString()}</div>
          <div className={styles.statSub}>connected of {linkedSessions.toLocaleString()} linked</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Status posts, 7 days</div>
          <div className={styles.statValue}>{statusPostsWeek.toLocaleString()}</div>
          {failedStatusWeek > 0
            ? <Link href="/admin/status?days=7" className={styles.statAlert}>{failedStatusWeek} failed</Link>
            : <div className={styles.statSub}>No failures</div>}
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Credits since the 1st</div>
          <div className={styles.statValue}>{monthlyCreditsUsed.toLocaleString()}</div>
          <div className={styles.statSub}>All users, this calendar month</div>
        </div>
      </div>

      <div className={styles.tables}>
        {/* Recent Users */}
        <div className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Recent Users</h2>
            <Link href="/admin/users" className={styles.viewAll}>View all</Link>
          </div>
          <div className={styles.tableCard}>
            {recentUsers.map((user) => (
              <div key={user.id} className={styles.row}>
                <div>
                  <div className={styles.rowName}>{user.name}</div>
                  <div className={styles.rowEmail}>{user.email}</div>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.rowDate}>{formatDate(user.createdAt.toISOString())}</span>
                  <span className={`${styles.statusPill} ${styles[`status-${user.status.toLowerCase()}`]}`}>
                    {user.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Agents */}
        <div className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Recent Agents</h2>
            <Link href="/admin/agents" className={styles.viewAll}>View all</Link>
          </div>
          <div className={styles.tableCard}>
            {recentAgents.map((agent) => (
              <div key={agent.id} className={styles.row}>
                <div>
                  <div className={styles.rowName}>{agent.businessName}</div>
                  <div className={styles.rowEmail}>{agent.user?.email}</div>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.rowDate}>{formatDate(agent.createdAt.toISOString())}</span>
                  <span className={`${styles.statusPill} ${styles[`status-${agent.status.toLowerCase()}`]}`}>
                    {agent.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
