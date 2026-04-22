import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { ChatsClient } from "@/components/dashboard/ChatsClient"
import Link from "next/link"
import Button from "@/components/ui/Button"

export default async function ChatsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const agents = await db.agent.findMany({
    where: { userId: session.user.id },
    select: { id: true, businessName: true, elevenlabsAgentId: true, profileImageUrl: true, agentRuntime: true, status: true },
    orderBy: { createdAt: "asc" },
  })

  const hasAny = agents.length > 0
  const hasElevenLabs = agents.some((a) => !!a.elevenlabsAgentId)
  const hasOrchestrator = agents.some((a) => a.agentRuntime === "orchestrator" && a.status === "ACTIVE")
  const hasAnyActive = hasElevenLabs || hasOrchestrator

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Conversations</h1>
          <p className={styles.subtitle}>
            {hasAnyActive ? "All conversations with your AI agents" : "Connect your agent to see conversations"}
          </p>
        </div>
      </div>

      {!hasAny && (
        <div className={styles.noAgent}>
          <div className={styles.noAgentIcon}>🤖</div>
          <div className={styles.noAgentTitle}>No agent created yet</div>
          <p className={styles.noAgentDesc}>Create your AI agent first to start receiving conversations.</p>
          <Link href="/dashboard/agent/create">
            <Button variant="primary">Create Agent</Button>
          </Link>
        </div>
      )}

      {hasAny && !hasAnyActive && (
        <div className={styles.notActive}>
          <div className={styles.notActiveIcon}>⚙️</div>
          <div className={styles.notActiveTitle}>Agent not yet connected</div>
          <p className={styles.notActiveDesc}>
            Your agent is being set up. Conversations will appear here once your agent is active on WhatsApp.
          </p>
        </div>
      )}

      {hasAnyActive && <ChatsClient agents={agents} />}
    </div>
  )
}
