import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { buildOrchestratorSystemPrompt } from "@/lib/orchestratorSync"
import { AUTO_BUILD_WAITING } from "@/lib/autoBuild"

// Signup lands here and goes straight on to the connect screen, with a blank agent
// waiting to be built from WhatsApp on first connect. The AI stays off until the
// build finishes so no customer ever gets a reply from an empty prompt.
export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.status !== "APPROVED") redirect("/dashboard")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompleted: true, maxAgents: true, businessName: true, agents: { select: { id: true }, take: 1 } },
  })
  if (!user || user.onboardingCompleted) redirect("/dashboard")

  if (user.agents.length === 0) {
    if (user.maxAgents < 1) redirect("/dashboard")
    const businessName = user.businessName || session.user.businessName || "My Business"
    const userId = session.user.id
    // This page can render twice in a row during the post-login redirects. The lock
    // makes the second render wait and then find the agent instead of adding another.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const existing = await tx.agent.count({ where: { userId } })
      if (existing > 0) return
      await tx.agent.create({
        data: {
          businessName,
          businessDescription: "",
          productsServices: "",
          faqs: "",
          operatingHours: "",
          userId,
          agentRuntime: "orchestrator",
          status: "ACTIVE",
          transportType: "baileys",
          aiRepliesEnabled: false,
          autoConfigStatus: AUTO_BUILD_WAITING,
          orchestratorAgents: {
            create: {
              name: businessName,
              systemPrompt: buildOrchestratorSystemPrompt(null),
              model: "gpt-4o-mini",
              temperature: 0.7,
              maxOutputTokens: 800,
            },
          },
        },
      })
    })
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { onboardingCompleted: true, historySyncEnabled: true },
  })

  redirect("/onboarding/connect")
}
