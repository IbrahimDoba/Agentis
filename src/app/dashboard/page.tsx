import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { AgentCard } from "@/components/dashboard/AgentCard"
import Button from "@/components/ui/Button"
import { formatDate } from "@/lib/utils"

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { agents: true },
  })

  if (!user) redirect("/login")

  const agent = user.agents[0] ?? null
  const firstName = user.name.split(" ")[0]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.greeting}>Welcome back, {firstName} 👋</h1>
        <p className={styles.subtitle}>
          Here&apos;s an overview of your Agentis account — {formatDate(new Date().toISOString())}
        </p>
      </div>

      <div className={styles.grid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Agent Status</div>
          <div className={styles.statValue}>
            {agent ? (agent.status === "ACTIVE" ? "Live" : "Pending") : "None"}
          </div>
          <div className={styles.statSub}>
            {agent ? `Last updated ${formatDate(agent.updatedAt.toISOString())}` : "No agent created yet"}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLabel}>Account Status</div>
          <div className={styles.statValue}>{user.status}</div>
          <div className={styles.statSub}>
            Member since {formatDate(user.createdAt.toISOString())}
          </div>
        </div>
      </div>

      <div className={styles.agentSection}>
        <div className={styles.sectionTitle}>Your AI Agent</div>

        {agent ? (
          <AgentCard agent={{
            id: agent.id,
            userId: agent.userId,
            businessName: agent.businessName,
            businessDescription: agent.businessDescription,
            productsServices: agent.productsServices,
            faqs: agent.faqs,
            operatingHours: agent.operatingHours,
            websiteLinks: agent.websiteLinks ?? undefined,
            responseGuidelines: agent.responseGuidelines ?? undefined,
            profileImageUrl: agent.profileImageUrl ?? undefined,
            whatsappBusinessName: agent.whatsappBusinessName ?? undefined,
            whatsappAgentLink: agent.whatsappAgentLink ?? undefined,
            whatsappPhoneNumber: agent.whatsappPhoneNumber ?? undefined,
            qrCodeUrl: agent.qrCodeUrl ?? undefined,
            elevenlabsAgentId: agent.elevenlabsAgentId ?? undefined,
            status: agent.status as any,
            createdAt: agent.createdAt.toISOString(),
            updatedAt: agent.updatedAt.toISOString(),
          }} />
        ) : (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>🤖</div>
            <div className={styles.emptyTitle}>No agent yet</div>
            <p className={styles.emptyDesc}>
              Create your AI WhatsApp agent in minutes. Just describe your business
              and we&apos;ll handle the rest.
            </p>
            <Link href="/dashboard/agent/create">
              <Button variant="primary">Create Your Agent →</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
