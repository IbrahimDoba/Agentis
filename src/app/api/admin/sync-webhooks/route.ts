import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { setAgentWebhook } from "@/lib/elevenlabs"

// POST /api/admin/sync-webhooks
// Registers the post-call webhook on every ElevenLabs agent that doesn't have one yet.
// Admin-only. Safe to re-run — ElevenLabs PATCH is idempotent.
export async function POST() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const agents = await db.agent.findMany({
    where: { elevenlabsAgentId: { not: null } },
    select: { id: true, elevenlabsAgentId: true, businessName: true },
  })

  const results: { agentId: string; elevenlabsAgentId: string; status: "ok" | "error"; error?: string }[] = []

  for (const agent of agents) {
    try {
      await setAgentWebhook(agent.elevenlabsAgentId!)
      results.push({ agentId: agent.id, elevenlabsAgentId: agent.elevenlabsAgentId!, status: "ok" })
    } catch (err) {
      results.push({
        agentId: agent.id,
        elevenlabsAgentId: agent.elevenlabsAgentId!,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const succeeded = results.filter((r) => r.status === "ok").length
  const failed = results.filter((r) => r.status === "error").length

  return NextResponse.json({ succeeded, failed, results })
}
