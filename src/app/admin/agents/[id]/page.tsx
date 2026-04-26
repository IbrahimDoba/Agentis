import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import styles from "./page.module.css"
import { AdminAgentClient } from "@/components/admin/AdminAgentClient"
import { StatusBadge } from "@/components/ui/Badge"
import { formatDate } from "@/lib/utils"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminAgentDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard")

  const { id } = await params

  const agent = await db.agent.findUnique({
    where: { id },
    include: { user: true },
  })

  if (!agent) notFound()

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
    whatsappPhoneNumberId: agent.whatsappPhoneNumberId ?? undefined,
    qrCodeUrl: agent.qrCodeUrl ?? undefined,
    elevenlabsAgentId: agent.elevenlabsAgentId ?? undefined,
    agentRuntime: agent.agentRuntime,
    transportType: agent.transportType,
    status: agent.status as any,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    user: {
      id: agent.user.id,
      name: agent.user.name,
      email: agent.user.email,
      phone: agent.user.phone,
      businessName: agent.user.businessName,
      role: agent.user.role as any,
      status: agent.user.status as any,
      createdAt: agent.user.createdAt.toISOString(),
    },
  }

  return <AdminAgentClient agent={agentPublic} />
}
