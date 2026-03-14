import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { AgentForm } from "@/components/dashboard/AgentForm"
import { StatusBadge } from "@/components/ui/Badge"
import { AgentCard } from "@/components/dashboard/AgentCard"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AgentDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params

  const agent = await db.agent.findUnique({
    where: { id },
  })

  if (!agent) notFound()

  // Only owner or admin can view
  if (agent.userId !== session.user.id && session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const agentPublic = {
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
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{agent.businessName}</h1>
          <p className={styles.subtitle}>Manage your AI agent configuration</p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Status Card */}
      <div className={styles.statusSection}>
        <AgentCard agent={agentPublic} />
      </div>

      {/* Edit Form */}
      <div className={styles.formSection}>
        <h2 className={styles.formTitle}>Edit Agent Details</h2>
        <p className={styles.formSubtitle}>
          Update your agent&apos;s configuration. Changes will be reviewed by our team.
        </p>
        <AgentForm initialData={agentPublic} agentId={agent.id} />
      </div>
    </div>
  )
}
