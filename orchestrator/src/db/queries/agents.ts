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
  type: "string" | "integer" | "boolean" | "number"
  description: string
  required: boolean
  enum?: string[]
}

export interface AgentTool {
  id: string
  name: string
  displayName: string
  description: string
  url: string
  method: "GET" | "POST"
  parameters: AgentToolParameter[]
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
      parameters: Array.isArray(item.parameters)
        ? item.parameters
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
            .map((p) => ({
              name: String(p.name ?? ""),
              type: (["string", "integer", "boolean", "number"].includes(String(p.type)) ? String(p.type) : "string") as AgentToolParameter["type"],
              description: String(p.description ?? ""),
              required: Boolean(p.required),
              enum: Array.isArray(p.enum) ? p.enum.map((v) => String(v)) : undefined,
            }))
        : [],
    }))
    .filter((tool) => !!tool.name && !!tool.url)
}
