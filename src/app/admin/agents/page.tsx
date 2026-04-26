import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import Link from "next/link"
import styles from "./page.module.css"
import { StatusBadge } from "@/components/ui/Badge"
import { formatDate } from "@/lib/utils"
import Button from "@/components/ui/Button"
import { baileysClient } from "@/lib/baileys-client"
import type { WorkerSessionStatus } from "@/lib/baileys-client"

export default async function AdminAgentsPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const agents = await db.agent.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true, businessName: true } },
      orchestratorAgents: { select: { model: true, isActive: true }, take: 1 },
    },
  })

  // Fetch session statuses in parallel for all baileys agents
  const baileysAgentIds = agents
    .filter((a) => a.transportType === "baileys")
    .map((a) => a.id)

  const sessionMap: Record<string, WorkerSessionStatus | null> = {}
  if (baileysAgentIds.length > 0) {
    const results = await Promise.allSettled(
      baileysAgentIds.map((id) => baileysClient.getSession(id))
    )
    baileysAgentIds.forEach((id, i) => {
      const r = results[i]
      sessionMap[id] = r.status === "fulfilled" ? r.value : null
    })
  }

  const connectedCount = Object.values(sessionMap).filter((s) => s?.status === "CONNECTED").length
  const orchestratorCount = agents.filter((a) => a.agentRuntime === "orchestrator").length
  const voiceCount = agents.filter((a) => a.agentRuntime === "elevenlabs").length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Agents</h1>
        <p className={styles.subtitle}>{agents.length} total · {orchestratorCount} AI Chat · {voiceCount} Voice · {connectedCount} sessions live</p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>Agent / Business</th>
              <th className={styles.th}>Owner</th>
              <th className={styles.th}>Runtime</th>
              <th className={styles.th}>Transport</th>
              <th className={styles.th}>Session</th>
              <th className={styles.th}>Phone</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Created</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 && (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>No agents yet</td>
              </tr>
            )}
            {(agents as any[]).map((agent: any) => {
              const workerSession: WorkerSessionStatus | null = sessionMap[agent.id] ?? null
              return (
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
                    <span className={agent.agentRuntime === "orchestrator" ? styles.badgeAi : styles.badgeVoice}>
                      {agent.agentRuntime === "orchestrator" ? "AI Chat" : "Voice"}
                    </span>
                    {agent.agentRuntime === "orchestrator" && agent.orchestratorAgents?.[0]?.model && (
                      <div className={styles.modelLabel}>{agent.orchestratorAgents[0].model}</div>
                    )}
                  </td>
                  <td className={styles.td}>
                    {agent.transportType === "baileys" ? (
                      <span className={styles.badgeBaileys}>WhatsApp Web</span>
                    ) : agent.transportType === "waba" ? (
                      <span className={styles.badgeWaba}>WABA</span>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    {agent.transportType === "baileys" ? (
                      workerSession ? (
                        <span className={styles[`session${workerSession.status}`] ?? styles.sessionDISCONNECTED}>
                          {workerSession.status === "CONNECTED" ? "Connected" :
                           workerSession.status === "QR_PENDING" ? "QR Pending" :
                           workerSession.status === "CONNECTING" ? "Connecting" :
                           workerSession.status === "BANNED" ? "Banned" :
                           workerSession.status === "LOGGED_OUT" ? "Logged Out" :
                           "Disconnected"}
                        </span>
                      ) : (
                        <span className={styles.sessionNone}>No session</span>
                      )
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    <div className={styles.muted}>
                      {workerSession?.phoneNumber || agent.whatsappPhoneNumber || "—"}
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
                      <Button size="sm" variant="secondary">Edit</Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
