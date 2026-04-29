import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow"

export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompleted: true },
  })
  if (user?.onboardingCompleted) redirect("/dashboard")

  return (
    <OnboardingFlow
      userName={session.user.name ?? "there"}
      businessName={session.user.businessName ?? ""}
    />
  )
}
