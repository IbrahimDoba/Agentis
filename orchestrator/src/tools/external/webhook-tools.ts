import type { ToolDefinition } from "../../providers/types.js"
import type { AgentTool, AgentToolParameter } from "../../db/queries/agents.js"

// Recursive — supports nested object/array params so we can declare schemas
// like AVMall's create_order ({contact: {...}, shipping: {...}, items: [...]})
// instead of forcing everything into stringified JSON the AI gets wrong.
function paramToSchema(p: AgentToolParameter): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: p.type,
    ...(p.description ? { description: p.description } : {}),
    ...(p.enum && p.enum.length > 0 ? { enum: p.enum } : {}),
  }
  if (p.type === "object" && p.properties && p.properties.length > 0) {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const np of p.properties) {
      properties[np.name] = paramToSchema(np)
      if (np.required) required.push(np.name)
    }
    schema.properties = properties
    if (required.length > 0) schema.required = required
    schema.additionalProperties = false
  }
  if (p.type === "array" && p.items) {
    schema.items = paramToSchema(p.items)
  }
  return schema
}

function toJsonSchema(tool: AgentTool): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of tool.parameters) {
    properties[param.name] = paramToSchema(param)
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

// Replace {param} placeholders in the URL with values from args.
// Returns the resolved URL and the remaining args not consumed by path params.
function applyUrlTemplate(
  rawUrl: string,
  args: Record<string, unknown>
): { resolvedUrl: string; remainingArgs: Record<string, unknown> } {
  const remaining = { ...args }
  const resolvedUrl = rawUrl.replace(/\{([^}]+)\}/g, (_, key) => {
    if (key in remaining && remaining[key] != null) {
      const val = encodeURIComponent(stringifyValue(remaining[key]))
      delete remaining[key]
      return val
    }
    return `{${key}}`
  })
  return { resolvedUrl, remainingArgs: remaining }
}

export async function executeWebhookTool(
  toolName: string,
  args: Record<string, unknown>,
  tools: AgentTool[]
): Promise<string> {
  const tool = tools.find((t) => t.name === toolName)
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${toolName}` })

  const toolHeaders: Record<string, string> = tool.headers ?? {}

  try {
    if (tool.method === "GET") {
      const { resolvedUrl, remainingArgs } = applyUrlTemplate(tool.url, args ?? {})
      const url = new URL(resolvedUrl)
      for (const [key, value] of Object.entries(remainingArgs)) {
        if (value === undefined || value === null) continue
        url.searchParams.set(key, stringifyValue(value))
      }
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: toolHeaders,
      })
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

    const { resolvedUrl, remainingArgs } = applyUrlTemplate(tool.url, args ?? {})
    const res = await fetch(resolvedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...toolHeaders },
      body: JSON.stringify(remainingArgs),
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
