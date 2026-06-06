import { NextRequest, NextResponse } from "next/server"
import { guardManageRequest } from "@/lib/apiManageGuard"
import { listAgentsForUser } from "@/lib/agentManagement"

// GET /api/v1/agents — list the key owner's agents. Requires "manage" scope.
export async function GET(req: NextRequest) {
  const guard = await guardManageRequest(req)
  if (!guard.ok) return guard.response

  const agents = await listAgentsForUser(guard.caller.userId)
  return NextResponse.json({ agents })
}
