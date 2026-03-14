import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { formatDate } from "@/lib/utils"

export default async function AdminPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const [userCount, agentCount, pendingUsers, pendingAgents, activeAgents] = await Promise.all([
    db.user.count(),
    db.agent.count(),
    db.user.count({ where: { status: "PENDING" } }),
    db.agent.count({ where: { status: "PENDING_REVIEW" } }),
    db.agent.count({ where: { status: "ACTIVE" } }),
  ])

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
        <h1 className={styles.title}>Admin Overview</h1>
        <p className={styles.subtitle}>Welcome back — {formatDate(new Date().toISOString())}</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>👥</div>
          <div className={styles.statValue}>{userCount}</div>
          <div className={styles.statLabel}>Total Users</div>
          {pendingUsers > 0 && (
            <div className={styles.statAlert}>{pendingUsers} pending approval</div>
          )}
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>🤖</div>
          <div className={styles.statValue}>{agentCount}</div>
          <div className={styles.statLabel}>Total Agents</div>
          {pendingAgents > 0 && (
            <div className={styles.statAlert}>{pendingAgents} pending review</div>
          )}
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>✅</div>
          <div className={styles.statValue}>{activeAgents}</div>
          <div className={styles.statLabel}>Active Agents</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>⏳</div>
          <div className={styles.statValue}>{pendingUsers}</div>
          <div className={styles.statLabel}>Pending Users</div>
        </div>
      </div>

      <div className={styles.tables}>
        {/* Recent Users */}
        <div className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Recent Users</h2>
            <a href="/admin/users" className={styles.viewAll}>View all →</a>
          </div>
          <div className={styles.tableCard}>
            {(recentUsers as any[]).map((user: any) => (
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
            <a href="/admin/agents" className={styles.viewAll}>View all →</a>
          </div>
          <div className={styles.tableCard}>
            {(recentAgents as any[]).map((agent: any) => (
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
