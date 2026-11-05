import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { buildOrchestratorSystemPrompt } from "@/lib/orchestratorSync"
import { AUTO_BUILD_WAITING } from "@/lib/autoBuild"

// Signup lands here and goes straight on to the QR page, with a blank agent
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

  let agentId = user.agents[0]?.id
  if (!agentId) {
    if (user.maxAgents < 1) redirect("/dashboard")
    const businessName = user.businessName || session.user.businessName || "My Business"
    const agent = await db.agent.create({
      data: {
        businessName,
        businessDescription: "",
        productsServices: "",
        faqs: "",
        operatingHours: "",
        userId: session.user.id,
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
      select: { id: true },
    })
    agentId = agent.id
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { onboardingCompleted: true, historySyncEnabled: true },
  })

  redirect(`/dashboard/channels/whatsapp-web?onboarding=1&agentId=${agentId}`)
}
