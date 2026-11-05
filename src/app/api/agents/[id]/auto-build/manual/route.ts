import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { writeAgentPromptField } from "@/lib/agentPromptWrite"
import { AUTO_BUILD_MANUAL, AUTO_BUILD_WAITING } from "@/lib/autoBuild"

type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  responseGuidelines: z.string().min(1).optional(),
  businessDescription: z.string().optional(),
})

// Takes the agent out of the auto-build and hands it to the manual steps. Called
// bare from the connect page, then again with the prompt from step 1.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  try {
    // Guarded on status so this can't pull an agent out of a build already running.
    const { count } = await db.agent.updateMany({
      where: { id, userId: session.user.id, autoConfigStatus: { in: [AUTO_BUILD_WAITING, AUTO_BUILD_MANUAL] } },
      data: {
        autoConfigStatus: AUTO_BUILD_MANUAL,
        aiRepliesEnabled: true,
        ...(parsed.data.businessDescription !== undefined && { businessDescription: parsed.data.businessDescription }),
      },
    })
    if (count === 0) {
      const exists = await db.agent.count({ where: { id, userId: session.user.id } })
      return exists
        ? NextResponse.json({ error: "Your agent is already being created" }, { status: 409 })
        : NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    if (parsed.data.responseGuidelines) {
      await writeAgentPromptField(id, "responseGuidelines", parsed.data.responseGuidelines)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[POST /api/agents/[id]/auto-build/manual]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
