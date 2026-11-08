import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { AdminAgentClient } from "@/components/admin/AdminAgentClient"

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

  const [labels, groups] = await Promise.all([
    db.whatsAppLabel.findMany({
      where: { agentId: id, deleted: false },
      orderBy: [{ isStage: "desc" }, { stageOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isStage: true, stageOrder: true, applyRule: true, aiDisabled: true, aiEnabled: true },
    }),
    db.groupChat.findMany({
      where: { agentId: id },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      select: { id: true, subject: true, replyMode: true, lastMessageAt: true },
    }),
  ])

  // Pass the full agent through — previously we hand-picked fields and dropped
  // things like productsData, toolsData, category, address. The forms then saved
  // empty values back, silently wiping the user's data.
  const agentPublic = {
    ...agent,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    user: {
      ...agent.user,
      createdAt: agent.user.createdAt.toISOString(),
      updatedAt: agent.user.updatedAt.toISOString(),
    },
  }

  return (
    <AdminAgentClient
      agent={agentPublic}
      labels={labels}
      groups={groups.map((g) => ({ ...g, lastMessageAt: g.lastMessageAt?.toISOString() ?? null }))}
    />
  )
}
