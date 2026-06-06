import { NextRequest, NextResponse } from "next/server"
import { guardManageRequest } from "@/lib/apiManageGuard"
import { apiError } from "@/lib/apiError"
import { getAgentForUser } from "@/lib/agentManagement"

interface Params {
  params: Promise<{ id: string }>
}

// GET /api/v1/agents/:id — one agent's config summary. Requires "manage" scope.
export async function GET(req: NextRequest, { params }: Params) {
  const guard = await guardManageRequest(req)
  if (!guard.ok) return guard.response

  const { id } = await params
  const agent = await getAgentForUser(guard.caller.userId, id)
  if (!agent) return apiError("AGENT_NOT_FOUND", "Agent not found.", { requestId: guard.requestId })

  return NextResponse.json({ agent })
}
