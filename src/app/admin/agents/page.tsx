import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import styles from "./page.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import { formatDate } from "@/lib/utils"
import Button from "@/components/ui/Button"

export default async function AdminAgentsPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const agents = await db.agent.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { name: true, email: true, businessName: true },
      },
    },
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Agents</h1>
        <p className={styles.subtitle}>{agents.length} total agents</p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>Agent / Business</th>
              <th className={styles.th}>Owner</th>
              <th className={styles.th}>WhatsApp Phone</th>
              <th className={styles.th}>ElevenLabs ID</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Created</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  No agents yet
                </td>
              </tr>
            )}
            {(agents as any[]).map((agent: any) => (
              <tr key={agent.id} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.agentName}>{agent.businessName}</div>
                  <div className={styles.agentId}>#{agent.id.slice(0, 8)}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.ownerName}>{agent.user?.name}</div>
                  <div className={styles.ownerEmail}>{agent.user?.email}</div>
                </td>
                <td className={styles.td}>
                  <div className={styles.muted}>
                    {agent.whatsappPhoneNumber || "—"}
                  </div>
                </td>
                <td className={styles.td}>
                  <div className={styles.code}>
                    {agent.elevenlabsAgentId ? (
                      <span className={styles.agentIdPill}>
                        {agent.elevenlabsAgentId.slice(0, 12)}...
                      </span>
                    ) : (
                      <span className={styles.muted}>Not set</span>
                    )}
                  </div>
                </td>
                <td className={styles.td}>
                  <StatusBadge status={agent.status} />
                </td>
                <td className={styles.td}>
                  <div className={styles.muted}>{formatDate(agent.createdAt.toISOString())}</div>
                </td>
                <td className={styles.td}>
                  <Link href={`/admin/agents/${agent.id}`}>
                    <Button size="sm" variant="secondary">Setup</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
