import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { AUTO_BUILD_MANUAL, AUTO_BUILD_WAITING } from "@/lib/autoBuild"
import { OnboardingConnect } from "@/components/onboarding/OnboardingConnect"

interface PageProps {
  searchParams: Promise<{ agentId?: string }>
}

export default async function OnboardingConnectPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect("/login")

  const { agentId } = await searchParams
  const agent = await db.agent.findFirst({
    where: {
      userId: session.user.id,
      autoConfigStatus: { in: [AUTO_BUILD_WAITING, AUTO_BUILD_MANUAL] },
      ...(agentId && { id: agentId }),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, autoConfigStatus: true },
  })
  if (!agent) redirect("/dashboard")

  return <OnboardingConnect agentId={agent.id} autoBuild={agent.autoConfigStatus === AUTO_BUILD_WAITING} />
}
