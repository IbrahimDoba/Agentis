import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface Params {
  params: Promise<{ id: string }>
}

async function assertAgentAccess(agentId: string, userId: string, role?: string) {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { userId: true, agentRuntime: true },
  })

  if (!agent) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) }
  }

  if (agent.userId !== userId && role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  if (agent.agentRuntime !== "orchestrator") {
    return { error: NextResponse.json({ error: "Only orchestrator agents support AI/human handoff mode" }, { status: 400 }) }
  }

  return { agent }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const access = await assertAgentAccess(id, session.user.id, session.user.role)
    if ("error" in access) return access.error

    const orchestratorAgent = await db.orchestratorAgent.findFirst({
      where: { agentId: id },
      select: { isActive: true },
    })

    return NextResponse.json({ mode: orchestratorAgent?.isActive === false ? "human" : "ai" })
  } catch (error) {
    console.error("[GET /api/agents/:id/orchestrator-mode]", error)
    return NextResponse.json({ error: "Failed to load orchestrator mode" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const access = await assertAgentAccess(id, session.user.id, session.user.role)
    if ("error" in access) return access.error

    const body = await req.json()
    const mode = body?.mode
    if (mode !== "ai" && mode !== "human") {
      return NextResponse.json({ error: "mode must be 'ai' or 'human'" }, { status: 400 })
    }

    await db.$transaction([
      db.orchestratorAgent.updateMany({
        where: { agentId: id },
        data: { isActive: mode === "ai" },
      }),
      db.conversation.updateMany({
        where: { agentId: id },
        data: { mode },
      }),
    ])

    return NextResponse.json({ ok: true, mode })
  } catch (error) {
    console.error("[PATCH /api/agents/:id/orchestrator-mode]", error)
    return NextResponse.json({ error: "Failed to update orchestrator mode" }, { status: 500 })
  }
}
