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

// Seconds to wait before replying, as milliseconds. Doubles as the debounce
// window: rapid messages within it are batched into one reply. 0 = reply
// instantly. Fails safe to 0 (instant) if the column isn't there yet.
export async function getReplyDelayMs(agentId: string): Promise<number> {
  try {
    const rows = await sql<{ replyDelaySeconds: number }[]>`
      SELECT "replyDelaySeconds" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
    `
    const secs = rows[0]?.replyDelaySeconds ?? 0
    return secs > 0 ? secs * 1000 : 0
  } catch {
    return 0
  }
}

// True when the agent's global "AI replies" master switch is OFF — the
// orchestrator should skip the AI for every conversation of this agent.
export async function isAiRepliesPaused(agentId: string): Promise<boolean> {
  const rows = await sql<{ aiRepliesEnabled: boolean }[]>`
    SELECT "aiRepliesEnabled" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  return rows[0]?.aiRepliesEnabled === false
}

// Whether the agent has the product-album feature enabled (gates the
// send_product_catalog tool).
export async function isProductAlbumEnabled(agentId: string): Promise<boolean> {
  const rows = await sql<{ productAlbumEnabled: boolean }[]>`
    SELECT "productAlbumEnabled" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  return rows[0]?.productAlbumEnabled === true
}

// Whether the reply guard (second-pass review before sending) runs for this
// agent. Off by default — when disabled the AI's reply is sent as-is.
export async function isReplyGuardEnabled(agentId: string): Promise<boolean> {
  try {
    const rows = await sql<{ replyGuardEnabled: boolean }[]>`
      SELECT "replyGuardEnabled" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
    `
    return rows[0]?.replyGuardEnabled === true
  } catch {
    // The column may not exist yet if the orchestrator deploys before the
    // migration runs. Default to off (guard disabled) — the safe default —
    // rather than throwing and blocking the reply entirely.
    return false
  }
}

// The agent's catalogue images + optional intro title, for the album send.
export async function getAgentProductAlbum(
  agentId: string
): Promise<{ images: string[]; captions: string[]; title: string | null }> {
  const rows = await sql<{ productsData: unknown; productAlbumTitle: string | null }[]>`
    SELECT "productsData", "productAlbumTitle" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  const row = rows[0]
  if (!row) return { images: [], captions: [], title: null }
  let products: unknown = row.productsData
  if (typeof products === "string") {
    try { products = JSON.parse(products) } catch { products = [] }
  }
  // Keep images + captions aligned: caption each image with its product name so
  // a quote-reply carries the product identity back (deterministic lookup).
  const valid = Array.isArray(products)
    ? (products as Array<{ imageUrl?: unknown; name?: unknown }>).filter(
        (p) => typeof p?.imageUrl === "string" && (p.imageUrl as string).length > 0
      )
    : []
  const images = valid.map((p) => p.imageUrl as string)
  const captions = valid.map((p) => (typeof p?.name === "string" ? (p.name as string) : ""))
  return { images, captions, title: row.productAlbumTitle }
}

interface CatalogueProduct {
  id?: string
  name?: string
  price?: string
  imageUrl?: string
  images?: unknown
}

// Parse the agent's productsData JSON into an array. Handles the JSONB-as-string
// driver quirk (some adapter paths return the column as a string). Returns []
// on any problem so callers degrade to "no products" rather than throwing.
async function loadProducts(agentId: string): Promise<CatalogueProduct[]> {
  const rows = await sql<{ productsData: unknown }[]>`
    SELECT "productsData" FROM "Agent" WHERE "id" = ${agentId} LIMIT 1
  `
  let products: unknown = rows[0]?.productsData
  if (typeof products === "string") {
    try { products = JSON.parse(products) } catch { products = [] }
  }
  return Array.isArray(products) ? (products as CatalogueProduct[]) : []
}

// All photos for ONE product (its different angles). Prefers the images[] array;
// falls back to the single imageUrl (cover) for products saved before multi-photo
// support. Returns null when the product isn't in the catalogue.
export async function getProductImages(
  agentId: string,
  productId: string
): Promise<{ name: string; images: string[] } | null> {
  const products = await loadProducts(agentId)
  const p = products.find((x) => x?.id === productId)
  if (!p) return null
  const images = productPhotos(p)
  return { name: typeof p.name === "string" ? p.name : "", images }
}

// Compact catalogue listing for the system prompt so the AI can map a product
// the customer names to its id (for send_product_photos). Only products that
// have at least one photo are listed — those are the ones the AI can show.
export async function listProductsForPrompt(
  agentId: string
): Promise<Array<{ id: string; name: string; price: string | null; photoCount: number }>> {
  const products = await loadProducts(agentId)
  return products
    .map((p) => ({
      id: typeof p.id === "string" ? p.id : "",
      name: typeof p.name === "string" ? p.name : "",
      price: typeof p.price === "string" && p.price.length > 0 ? p.price : null,
      photoCount: productPhotos(p).length,
    }))
    .filter((p) => p.id && p.name && p.photoCount > 0)
}

// images[] (multi-photo) preferred; fall back to the single imageUrl cover.
function productPhotos(p: CatalogueProduct): string[] {
  if (Array.isArray(p.images) && p.images.length > 0) {
    return p.images.filter((u): u is string => typeof u === "string" && u.length > 0)
  }
  return typeof p.imageUrl === "string" && p.imageUrl.length > 0 ? [p.imageUrl] : []
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
