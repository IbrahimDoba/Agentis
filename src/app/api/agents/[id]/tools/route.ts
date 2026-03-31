import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateAgentTools } from "@/lib/elevenlabs"
import type { AgentTool } from "@/types"

interface Params {
  params: Promise<{ id: string }>
}

function buildElevenLabsTool(tool: AgentTool) {
  const params = tool.parameters.reduce(
    (acc, p) => {
      acc[p.name] = {
        type: p.type,
        description: p.description,
        ...(p.enum && p.enum.length > 0 ? { enum: p.enum } : {}),
      }
      return acc
    },
    {} as Record<string, any>
  )

  const required = tool.parameters.filter((p) => p.required).map((p) => p.name)

  const paramSchema =
    tool.parameters.length > 0
      ? {
          properties: params,
          ...(required.length > 0 ? { required } : {}),
        }
      : undefined

  return {
    type: "webhook",
    name: tool.name,
    description: tool.description,
    response_timeout_secs: 15,
    tool_error_handling_mode: "summarized",
    api_schema: {
      url: tool.url,
      method: tool.method,
      ...(tool.method === "GET" && paramSchema
        ? { query_params_schema: paramSchema }
        : {}),
      ...(tool.method === "POST" && paramSchema
        ? { request_body_schema: { type: "object", ...paramSchema } }
        : {}),
    },
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const agent = await db.agent.findUnique({
      where: { id },
      select: { userId: true, elevenlabsAgentId: true },
    })

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const isOwner = agent.userId === session.user.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const tools: AgentTool[] = (body.tools ?? []).map((t: AgentTool) => ({
      ...t,
      name: t.name.trim(),
      displayName: t.displayName.trim(),
      description: t.description.trim(),
      url: t.url.trim(),
      parameters: t.parameters.map((p) => ({
        ...p,
        name: p.name.trim(),
        description: p.description.trim(),
      })),
    }))

    // Save to DB
    await db.agent.update({
      where: { id },
      data: { toolsData: tools as any },
    })

    // Sync to ElevenLabs if connected
    if (agent.elevenlabsAgentId) {
      const elTools = tools.map(buildElevenLabsTool)
      await updateAgentTools(agent.elevenlabsAgentId, elTools)
    }

    return NextResponse.json({ ok: true, synced: !!agent.elevenlabsAgentId })
  } catch (error: any) {
    console.error("[PUT /api/agents/:id/tools]", error)
    return NextResponse.json({ error: error?.message ?? "Failed to save tools" }, { status: 500 })
  }
}
