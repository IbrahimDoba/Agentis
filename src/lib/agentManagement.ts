import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { updateAgentTools } from "@/lib/elevenlabs"
import type { AgentTool } from "@/types"

// Surface B (management) services for the External Developer API. Each is
// owner-scoped: it returns null when the agent doesn't exist OR isn't the
// caller's, which the routes map to AGENT_NOT_FOUND. Webhook-tool writes mirror
// the dashboard tools route (DB toolsData + ElevenLabs sync) so the two stay
// behaviourally aligned.

export interface AgentSummary {
  id: string
  businessName: string
  status: string
  createdAt: Date
  hasElevenLabs: boolean
}

export async function listAgentsForUser(userId: string): Promise<AgentSummary[]> {
  const agents = await db.agent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, businessName: true, status: true, createdAt: true, elevenlabsAgentId: true },
  })
  return agents.map((a) => ({
    id: a.id,
    businessName: a.businessName,
    status: a.status,
    createdAt: a.createdAt,
    hasElevenLabs: !!a.elevenlabsAgentId,
  }))
}

export interface AgentDetail extends AgentSummary {
  businessDescription: string
  productsServices: string
  faqs: string
  operatingHours: string
  contactEmail: string | null
  toolCount: number
}

export async function getAgentForUser(userId: string, agentId: string): Promise<AgentDetail | null> {
  const a = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      userId: true,
      businessName: true,
      businessDescription: true,
      productsServices: true,
      faqs: true,
      operatingHours: true,
      contactEmail: true,
      status: true,
      createdAt: true,
      elevenlabsAgentId: true,
      toolsData: true,
    },
  })
  if (!a || a.userId !== userId) return null
  return {
    id: a.id,
    businessName: a.businessName,
    businessDescription: a.businessDescription,
    productsServices: a.productsServices,
    faqs: a.faqs,
    operatingHours: a.operatingHours,
    contactEmail: a.contactEmail,
    status: a.status,
    createdAt: a.createdAt,
    hasElevenLabs: !!a.elevenlabsAgentId,
    toolCount: Array.isArray(a.toolsData) ? a.toolsData.length : 0,
  }
}

// --- Webhook tools ---

// Map an AgentTool to the ElevenLabs webhook-tool shape. Ported from the
// dashboard tools route (src/app/api/agents/[id]/tools/route.ts) — keep in sync.
function buildElevenLabsTool(tool: AgentTool) {
  const params = tool.parameters.reduce<Record<string, unknown>>((acc, p) => {
    acc[p.name] = {
      type: p.type,
      description: p.description,
      ...(p.enum && p.enum.length > 0 ? { enum: p.enum } : {}),
    }
    return acc
  }, {})
  const required = tool.parameters.filter((p) => p.required).map((p) => p.name)
  const paramSchema =
    tool.parameters.length > 0
      ? { properties: params, ...(required.length > 0 ? { required } : {}) }
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
      ...(tool.method === "GET" && paramSchema ? { query_params_schema: { type: "object", ...paramSchema } } : {}),
      ...(tool.method === "POST" && paramSchema ? { request_body_schema: { type: "object", ...paramSchema } } : {}),
    },
  }
}

export async function getAgentToolsForUser(userId: string, agentId: string): Promise<AgentTool[] | null> {
  const a = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true, toolsData: true } })
  if (!a || a.userId !== userId) return null
  return Array.isArray(a.toolsData) ? (a.toolsData as unknown as AgentTool[]) : []
}

export interface SetToolsResult {
  ok: true
  synced: boolean // whether tools were pushed to a connected ElevenLabs agent
  tools: AgentTool[]
}

// Input shape from the API: id + displayName are optional (we fill them).
export type ApiToolInput = Omit<AgentTool, "id" | "displayName"> & {
  id?: string
  displayName?: string
}

// Replace an agent's webhook tools: normalize, persist to DB, and sync to
// ElevenLabs when connected. Returns null if the agent isn't the caller's.
export async function setAgentToolsForUser(
  userId: string,
  agentId: string,
  tools: ApiToolInput[]
): Promise<SetToolsResult | null> {
  const a = await db.agent.findUnique({
    where: { id: agentId },
    select: { userId: true, elevenlabsAgentId: true },
  })
  if (!a || a.userId !== userId) return null

  const normalized: AgentTool[] = tools.map((t) => ({
    id: t.id || randomUUID(),
    name: t.name.trim(),
    displayName: (t.displayName ?? t.name).trim(),
    description: t.description.trim(),
    url: t.url.trim(),
    method: t.method,
    parameters: (t.parameters ?? []).map((p) => ({
      ...p,
      name: p.name.trim(),
      description: p.description.trim(),
    })),
    ...(t.headers ? { headers: t.headers } : {}),
  }))

  await db.agent.update({ where: { id: agentId }, data: { toolsData: normalized as unknown as object } })

  let synced = false
  if (a.elevenlabsAgentId) {
    await updateAgentTools(a.elevenlabsAgentId, normalized.map(buildElevenLabsTool))
    synced = true
  }

  return { ok: true, synced, tools: normalized }
}
