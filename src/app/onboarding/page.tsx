import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow"

export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <OnboardingFlow
      userName={session.user.name ?? "there"}
      businessName={session.user.businessName ?? ""}
    />
  )
}
