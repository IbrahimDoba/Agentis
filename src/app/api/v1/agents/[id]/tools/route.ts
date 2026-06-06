import { NextRequest, NextResponse } from "next/server"
import { guardManageRequest } from "@/lib/apiManageGuard"
import { apiError } from "@/lib/apiError"
import { getAgentToolsForUser, setAgentToolsForUser } from "@/lib/agentManagement"
import { apiSetToolsSchema } from "@/lib/validations"

interface Params {
  params: Promise<{ id: string }>
}

// GET /api/v1/agents/:id/tools — list the agent's webhook tools.
export async function GET(req: NextRequest, { params }: Params) {
  const guard = await guardManageRequest(req)
  if (!guard.ok) return guard.response

  const { id } = await params
  const tools = await getAgentToolsForUser(guard.caller.userId, id)
  if (tools === null) return apiError("AGENT_NOT_FOUND", "Agent not found.", { requestId: guard.requestId })

  return NextResponse.json({ tools })
}

// PUT /api/v1/agents/:id/tools — replace the agent's webhook tools (persists to
// the DB and syncs to ElevenLabs when connected — same as the dashboard).
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardManageRequest(req)
  if (!guard.ok) return guard.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError("BAD_REQUEST", "Invalid JSON body.", { requestId: guard.requestId })
  }
  const parsed = apiSetToolsSchema.safeParse(raw)
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid tools payload.", {
      requestId: guard.requestId,
    })
  }

  const { id } = await params
  const result = await setAgentToolsForUser(guard.caller.userId, id, parsed.data.tools)
  if (!result) return apiError("AGENT_NOT_FOUND", "Agent not found.", { requestId: guard.requestId })

  return NextResponse.json(result)
}
