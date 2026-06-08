import { sql } from "../client.js"

export interface OrchestratorAgent {
  id: string
  agentId: string       // parent Agent (business) ID
  name: string
  systemPrompt: string
  personality: string | null
  model: string
  temperature: number
  maxOutputTokens: number
  shortTermWindow: number
  summarizeAfter: number
  isActive: boolean
}

export interface AgentWithRuntime {
  id: string
  agentRuntime: string
  transportType: string
  businessName: string
}

export interface AgentToolParameter {
  name: string
  type: "string" | "integer" | "boolean" | "number" | "object" | "array"
  description: string
  required: boolean
  enum?: string[]
  // For type: "object" — nested params. The OpenAI function-calling spec
  // expects these as a JSON Schema; we recursively convert in toJsonSchema.
  properties?: AgentToolParameter[]
  // For type: "array" — schema of each item.
  items?: AgentToolParameter
}

export interface AgentTool {
  id: string
  name: string
  displayName: string
  description: string
  url: string
  method: "GET" | "POST"
  parameters: AgentToolParameter[]
  headers?: Record<string, string>
  // Optional widget-rendering hint. When set, the orchestrator uses this to
  // pull structured product / card data out of the tool's response and
  // attach it to the assistant reply for the embed widget to render.
  responseMapping?: Record<string, unknown>
}

export async function getAgentRuntime(agentId: string): Promise<AgentWithRuntime | null> {
  const rows = await sql<AgentWithRuntime[]>`
    SELECT "id", "agentRuntime", "transportType", "businessName"
    FROM "Agent"
    WHERE "id" = ${agentId}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getOrchestratorAgent(agentId: string): Promise<OrchestratorAgent | null> {
  const rows = await sql<OrchestratorAgent[]>`
    SELECT "id", "agentId", "name", "systemPrompt", "personality",
           "model", "temperature", "maxOutputTokens", "shortTermWindow",
           "summarizeAfter", "isActive"
    FROM "OrchestratorAgent"
    WHERE "agentId" = ${agentId}
    LIMIT 1
  `
  return rows[0] ?? null
}

// True when the agent's global "AI replies" master switch is OFF — the
// orchestrator should skip the AI for every conversation of this agent.
export async function isAiRepliesPaused(agentId: string): Promise<boolean> {
  const rows = await sql<{ aiRepliesEnabled: boolean }[]>`
    SELECT "aiRepliesEnabled" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  return rows[0]?.aiRepliesEnabled === false
}

export async function getAgentTools(agentId: string): Promise<AgentTool[]> {
  const rows = await sql<{ toolsData: unknown }[]>`
    SELECT "toolsData"
    FROM "Agent"
    WHERE "id" = ${agentId}
    LIMIT 1
  `

  const raw = rows[0]?.toolsData
  if (!raw) return []

  const parsed = Array.isArray(raw) ? raw : []
  return parsed
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      displayName: String(item.displayName ?? item.name ?? ""),
      description: String(item.description ?? ""),
      url: String(item.url ?? ""),
      method: (String(item.method ?? "GET").toUpperCase() === "POST" ? "POST" : "GET") as "GET" | "POST",
      headers: item.headers && typeof item.headers === "object" && !Array.isArray(item.headers)
        ? (item.headers as Record<string, string>)
        : undefined,
      responseMapping: item.responseMapping && typeof item.responseMapping === "object" && !Array.isArray(item.responseMapping)
        ? (item.responseMapping as Record<string, unknown>)
        : undefined,
      parameters: Array.isArray(item.parameters)
        ? item.parameters
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
            .map(parseParameter)
        : [],
    }))
    .filter((tool) => !!tool.name && !!tool.url)
}

// Recursive so nested object/array params (e.g. AVMall's create_order with
// `contact` + `shipping` objects and an `items` array of {productSlug,quantity})
// can be declared in toolsData JSON and converted to JSON Schema downstream.
function parseParameter(p: Record<string, unknown>): AgentToolParameter {
  const ALLOWED_TYPES = ["string", "integer", "boolean", "number", "object", "array"] as const
  const rawType = String(p.type ?? "string")
  const type = (ALLOWED_TYPES.includes(rawType as typeof ALLOWED_TYPES[number]) ? rawType : "string") as AgentToolParameter["type"]
  const result: AgentToolParameter = {
    name: String(p.name ?? ""),
    type,
    description: String(p.description ?? ""),
    required: Boolean(p.required),
    enum: Array.isArray(p.enum) ? p.enum.map((v) => String(v)) : undefined,
  }
  if (type === "object" && Array.isArray(p.properties)) {
    result.properties = p.properties
      .filter((np): np is Record<string, unknown> => !!np && typeof np === "object")
      .map(parseParameter)
  }
  if (type === "array" && p.items && typeof p.items === "object") {
    result.items = parseParameter(p.items as Record<string, unknown>)
  }
  return result
}
