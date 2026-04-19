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
    WHERE "agentId" = ${agentId} AND "isActive" = true
    LIMIT 1
  `
  return rows[0] ?? null
}
