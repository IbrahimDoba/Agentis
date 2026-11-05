import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow"

interface PageProps {
  searchParams: Promise<{ agentId?: string }>
}

// The step-by-step setup, for owners who'd rather not build from their chats.
export default async function ManualOnboardingPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect("/login")

  const { agentId } = await searchParams
  if (!agentId) redirect("/dashboard")

  const agent = await db.agent.findFirst({
    where: { id: agentId, userId: session.user.id },
    select: { id: true, businessName: true },
  })
  if (!agent) redirect("/dashboard")

  return <OnboardingFlow agentId={agent.id} userName={session.user.name ?? "there"} businessName={agent.businessName} />
}
