import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { MetaAccountDetailClient } from "@/components/dashboard/MetaAccountDetailClient"
import styles from "../page.module.css"

interface Props {
  params: Promise<{ phoneNumberId: string }>
}

export default async function MetaAccountPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { metaEnabled: true },
  })
  if (!user?.metaEnabled) redirect("/dashboard")

  const { phoneNumberId } = await params

  // findFirst with userId, not findUnique on phoneNumberId: the id is globally
  // unique, so a bare lookup would render another account's connection to
  // whoever guessed the URL.
  const connection = await db.metaConnection.findFirst({
    where: { phoneNumberId, userId: session.user.id },
    select: {
      phoneNumberId: true,
      wabaId: true,
      businessId: true,
      displayPhoneNumber: true,
      verifiedName: true,
      agentId: true,
      aiRepliesEnabled: true,
      typingIndicator: true,
      registeredAt: true,
      subscribedAt: true,
      agent: { select: { businessName: true } },
    },
  })
  if (!connection) notFound()

  const agents = await db.agent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, businessName: true },
  })

  // Plain DTO across the server/client boundary — Dates don't survive it.
  return (
    <div className={styles.page}>
      <MetaAccountDetailClient
        connection={{
          phoneNumberId: connection.phoneNumberId,
          wabaId: connection.wabaId,
          businessId: connection.businessId,
          displayPhoneNumber: connection.displayPhoneNumber,
          verifiedName: connection.verifiedName,
          agentId: connection.agentId,
          agentName: connection.agent?.businessName ?? null,
          aiRepliesEnabled: connection.aiRepliesEnabled,
          typingIndicator: connection.typingIndicator,
          registeredAt: connection.registeredAt?.toISOString() ?? null,
          subscribedAt: connection.subscribedAt?.toISOString() ?? null,
        }}
        agents={agents}
      />
    </div>
  )
}
