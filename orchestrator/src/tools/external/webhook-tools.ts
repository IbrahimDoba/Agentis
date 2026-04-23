import type { ToolDefinition } from "../../providers/types.js"
import type { AgentTool } from "../../db/queries/agents.js"

function toJsonSchema(tool: AgentTool): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of tool.parameters) {
    properties[param.name] = {
      type: param.type,
      description: param.description || undefined,
      ...(param.enum && param.enum.length > 0 ? { enum: param.enum } : {}),
    }
    if (param.required) required.push(param.name)
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: true,
  }
}

export function buildWebhookToolDefinitions(tools: AgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || tool.displayName || `Call external API tool: ${tool.name}`,
      parameters: toJsonSchema(tool),
    },
  }))
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

export async function executeWebhookTool(
  toolName: string,
  args: Record<string, unknown>,
  tools: AgentTool[]
): Promise<string> {
  const tool = tools.find((t) => t.name === toolName)
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${toolName}` })

  try {
    if (tool.method === "GET") {
      const url = new URL(tool.url)
      for (const [key, value] of Object.entries(args ?? {})) {
        if (value === undefined || value === null) continue
        url.searchParams.set(key, stringifyValue(value))
      }
      const res = await fetch(url.toString(), { method: "GET" })
      const body = await res.text()
      if (!res.ok) {
        return JSON.stringify({
          ok: false,
          status: res.status,
          error: `Webhook GET failed for ${tool.name}`,
          body: body.slice(0, 2000),
        })
      }
      return JSON.stringify({
        ok: true,
        status: res.status,
        tool: tool.name,
        body: body.slice(0, 12000),
      })
    }

    const res = await fetch(tool.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args ?? {}),
    })
    const body = await res.text()
    if (!res.ok) {
      return JSON.stringify({
        ok: false,
        status: res.status,
        error: `Webhook POST failed for ${tool.name}`,
        body: body.slice(0, 2000),
      })
    }
    return JSON.stringify({
      ok: true,
      status: res.status,
      tool: tool.name,
      body: body.slice(0, 12000),
    })
  } catch (err: any) {
    return JSON.stringify({
      ok: false,
      error: `Webhook execution error for ${tool.name}`,
      details: err?.message ?? String(err),
    })
  }
}
