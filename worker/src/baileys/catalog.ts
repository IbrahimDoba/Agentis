import { sessionManager } from "./session-manager.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "catalog" })

// One product as returned by the connected WhatsApp Business account's catalog.
// Deliberately RAW: prices stay in WhatsApp's units and image URLs are the
// (expiring) WA CDN links. The app layer formats the price and re-hosts images
// when merging into the agent's catalogue — the worker just reads WhatsApp.
export interface WhatsAppCatalogProduct {
  /** WhatsApp's internal product id. */
  productId: string
  /** Operator's own SKU / retailer id — the STABLE key we merge on. */
  retailerId?: string
  name: string
  description?: string
  /**
   * Price in WhatsApp's raw units. WhatsApp encodes the amount as
   * (major-unit price × 1000), so ₦35,000 arrives as 35_000_000. The app
   * divides by 1000 to display — kept raw here so we don't lose precision or
   * guess the currency's minor units in the worker.
   */
  priceRaw: number
  currency?: string
  /** All image URLs WhatsApp returned for the product (CDN links — they expire). */
  imageUrls: string[]
  /** Public catalog URL for the product, if any. */
  url?: string
  /** Hidden products are set up but not shown in the shopfront. */
  isHidden: boolean
}

export interface WhatsAppCatalogResult {
  products: WhatsAppCatalogProduct[]
  count: number
  /** True if we stopped at the page cap (catalogue larger than we fetched). */
  truncated: boolean
}

// Baileys' business methods aren't on the base WASocket type in a way TS picks
// up cleanly here — declare the narrow slice we use.
interface CatalogSocket {
  getCatalog: (opts: { limit?: number; cursor?: string }) => Promise<{
    products: RawProduct[]
    nextPageCursor?: string
  }>
}
interface RawProduct {
  id: string
  retailerId?: string
  name?: string
  description?: string
  price?: number
  currency?: string
  url?: string
  isHidden?: boolean
  imageUrls?: Record<string, string>
}

const PAGE_SIZE = 100
const MAX_PAGES = 20 // safety bound: 2,000 products

/**
 * Read the connected number's OWN WhatsApp Business catalogue, paginated.
 * Throws a 409-tagged error when the agent has no live session. Returns an
 * empty list (not an error) when the account simply has no catalogue —
 * personal accounts, or business accounts that never set one up.
 */
export async function fetchWhatsAppCatalog(agentId: string): Promise<WhatsAppCatalogResult> {
  const sock = sessionManager.get(agentId) as unknown as CatalogSocket | null
  if (!sock || typeof sock.getCatalog !== "function") {
    const err = new Error("Agent is not connected to WhatsApp") as Error & { statusCode?: number }
    err.statusCode = 409
    throw err
  }

  const products: WhatsAppCatalogProduct[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const res = await sock.getCatalog({ limit: PAGE_SIZE, cursor })
    for (const raw of res.products ?? []) products.push(normalizeProduct(raw))
    cursor = res.nextPageCursor
    pages++
  } while (cursor && pages < MAX_PAGES)

  const truncated = Boolean(cursor) && pages >= MAX_PAGES
  logger.info({ agentId, count: products.length, pages, truncated }, "Fetched WhatsApp catalogue")
  return { products, count: products.length, truncated }
}

export function normalizeProduct(raw: RawProduct): WhatsAppCatalogProduct {
  return {
    productId: raw.id,
    retailerId: raw.retailerId || undefined,
    name: raw.name ?? "",
    description: raw.description || undefined,
    priceRaw: typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : 0,
    currency: raw.currency || undefined,
    imageUrls: raw.imageUrls
      ? Object.values(raw.imageUrls).filter((u): u is string => typeof u === "string" && u.length > 0)
      : [],
    url: raw.url || undefined,
    isHidden: Boolean(raw.isHidden),
  }
}
