import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { baileysClient } from "@/lib/baileys-client"
import type { WorkerSessionStatus } from "@/lib/baileys-client"
import { SessionsTable } from "@/components/admin/SessionsTable"
import styles from "./page.module.css"

export default async function AdminSessionsPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const agents = await db.agent.findMany({
    where: { agentRuntime: "orchestrator" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      businessName: true,
      user: { select: { name: true, email: true } },
    },
  })

  // Fetch all session statuses in parallel
  const sessionResults = await Promise.allSettled(
    agents.map((a) => baileysClient.getSession(a.id))
  )

  const rows = agents.map((a, i) => {
    const r = sessionResults[i]
    const workerSession: WorkerSessionStatus | null = r.status === "fulfilled" ? r.value : null
    return {
      agentId: a.id,
      businessName: a.businessName,
      ownerName: a.user.name,
      ownerEmail: a.user.email,
      session: workerSession,
    }
  })

  const connectedCount = rows.filter((r) => r.session?.status === "CONNECTED").length
  const bannedCount = rows.filter((r) => r.session?.status === "BANNED").length
  const noSessionCount = rows.filter((r) => !r.session).length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>WhatsApp Sessions</h1>
        <p className={styles.subtitle}>
          {agents.length} agents · {connectedCount} connected · {bannedCount > 0 ? `${bannedCount} banned · ` : ""}{noSessionCount} no session
        </p>
      </div>

      <SessionsTable rows={rows} />
    </div>
  )
}
