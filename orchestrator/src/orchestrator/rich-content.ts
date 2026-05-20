// Build structured UI payloads from external-tool results so the embed widget
// can render product cards instead of raw markdown the AI wrote out.
//
// Extraction strategy: heuristic by default, mapping overrides as needed.
//
//   * Heuristic — walks the parsed response for an array (or single object)
//     that looks like a product (has a name, a price-like number, an image).
//     Maps the common synonyms (priceKobo / priceCents / price, imageUrl /
//     image / thumbnail, etc.) so most vendors get cards for free.
//
//   * Mapping — optional per-tool `responseMapping` in the AgentTool
//     definition. Any field you set replaces the heuristic's synonym list
//     for that field; everything you leave blank still falls through to
//     synonyms. Use this when:
//       - field names don't match any common convention,
//       - you want product URLs built from a slug (productUrlTemplate),
//       - you want to declare currency (currency),
//       - or you want to point at a deeply-nested array (itemsPath).

export interface ProductCard {
  id: string
  slug: string | null
  name: string
  priceCents: number          // unified minor unit
  originalPriceCents: number | null
  currency: string            // ISO 4217 (defaults to "NGN")
  imageUrl: string | null
  stock: number | null
  inStock: boolean
  productUrl: string | null
}

export interface RichContent {
  type: "products"
  products: ProductCard[]
}

// Per-tool mapping authored in the tool definition (toolsData JSON column).
// Every field is optional — empty means "use heuristic for this".
export interface ProductResponseMapping {
  type: "products"
  itemsPath?: string                       // dot-path to product array, e.g. "data.products"
  singleItemPath?: string                  // dot-path to single product object
  fields?: {
    id?: string
    name?: string
    slug?: string
    price?: string
    priceUnit?: "major" | "minor"          // default minor (kobo / cents)
    originalPrice?: string                 // strikethrough "was" price
    image?: string
    stock?: string
    inStock?: string
    url?: string
  }
  currency?: string                        // default "NGN"
  productUrlTemplate?: string              // e.g. "https://shop.example.com/p/{slug}"
}

interface ToolResultRecord {
  toolName: string
  rawResult: string
  mapping?: ProductResponseMapping
}

// ── Heuristic field synonyms ──────────────────────────────────────────────
const NAME_FIELDS = ["name", "title", "productName", "label"]
const ID_FIELDS = ["id", "productId", "_id", "sku"]
const SLUG_FIELDS = ["slug", "handle", "permalink"]
const IMAGE_FIELDS = ["imageUrl", "image", "thumbnail", "thumbnailUrl", "photo", "picture", "img"]
const STOCK_FIELDS = ["stock", "inventory", "quantity", "available", "qty"]
const IN_STOCK_FIELDS = ["inStock", "isAvailable", "available"]
const URL_FIELDS = ["url", "productUrl", "link", "href", "permalink"]

// Two price tiers. Minor-unit fields end in Kobo/Cents/Minor; major-unit
// fields are decimals. We try minor first so e.g. AVMall's `priceKobo`
// (integer) beats a vendor's `price` field (decimal) if both exist.
const PRICE_MINOR_FIELDS = ["priceKobo", "priceCents", "priceMinor", "amountMinor", "amountCents"]
const PRICE_MAJOR_FIELDS = ["price", "amount", "cost"]
// AVMall convention: priceKobo is the list price, saleKobo the cheaper
// promo price. When both are present and sale < list, sale becomes the
// headline and list becomes the strikethrough.
const SALE_PRICE_MINOR_FIELDS = ["saleKobo", "salePriceKobo", "salePriceCents", "salePriceMinor"]
const SALE_PRICE_MAJOR_FIELDS = ["salePrice", "saleAmount"]
const ORIGINAL_PRICE_MINOR_FIELDS = ["originalPriceKobo", "originalPriceCents", "listPriceKobo", "listPriceCents", "compareAtPriceCents"]
const ORIGINAL_PRICE_MAJOR_FIELDS = ["originalPrice", "listPrice", "msrp", "compareAtPrice", "wasPrice"]

// ── Helpers ────────────────────────────────────────────────────────────────
function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined
  const parts = path.split(".").filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function pickField(o: Record<string, unknown>, candidates: string[]): unknown {
  for (const k of candidates) {
    if (k in o && o[k] != null) return o[k]
  }
  return undefined
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

// Webhook executor wraps the upstream response:
//   { ok: true, status, tool, body: "<stringified upstream JSON>" }
// We unwrap once to get the outer envelope, then JSON-parse the body string.
function unwrapToolBody(raw: string): unknown {
  try {
    const outer = JSON.parse(raw)
    if (!outer || typeof outer !== "object") return null
    if (outer.ok === false) return null
    const body = outer.body
    if (typeof body !== "string") return null
    return JSON.parse(body)
  } catch {
    return null
  }
}

// ── Product-shape detection ───────────────────────────────────────────────
function looksLikeProduct(o: unknown): boolean {
  if (!isPlainObject(o)) return false
  const hasName = NAME_FIELDS.some((f) => typeof o[f] === "string" && (o[f] as string).trim())
  const hasPrice = [
    ...PRICE_MINOR_FIELDS,
    ...PRICE_MAJOR_FIELDS,
    ...SALE_PRICE_MINOR_FIELDS,
    ...SALE_PRICE_MAJOR_FIELDS,
  ].some((f) => typeof o[f] === "number")
  const hasImage = IMAGE_FIELDS.some((f) => typeof o[f] === "string")
  // All three required — keeps order line-items and unrelated arrays from
  // accidentally becoming product cards.
  return hasName && hasPrice && hasImage
}

function findProductArray(root: unknown): unknown[] {
  if (Array.isArray(root) && root.length > 0 && looksLikeProduct(root[0])) return root
  if (!isPlainObject(root)) return []
  for (const key of ["products", "items", "results", "matches", "data"]) {
    if (key in root) {
      const found = findProductArray(root[key])
      if (found.length > 0) return found
    }
  }
  for (const v of Object.values(root)) {
    if (v && typeof v === "object") {
      const found = findProductArray(v)
      if (found.length > 0) return found
    }
  }
  return []
}

function findSingleProduct(root: unknown): unknown | null {
  if (looksLikeProduct(root)) return root
  if (!isPlainObject(root)) return null
  for (const key of ["product", "item", "result", "data"]) {
    if (key in root) {
      const v = root[key]
      if (looksLikeProduct(v)) return v
      if (isPlainObject(v)) {
        const nested = findSingleProduct(v)
        if (nested) return nested
      }
    }
  }
  return null
}

// ── Field extraction (mapping overrides synonyms field-by-field) ──────────
function readField(p: Record<string, unknown>, override: string | undefined, fallbacks: string[]): unknown {
  if (override) return p[override]
  return pickField(p, fallbacks)
}

function extractPrice(
  p: Record<string, unknown>,
  mapping?: ProductResponseMapping
): { priceCents: number; originalPriceCents: number | null } | null {
  // Mapping override: caller named the price field explicitly.
  if (mapping?.fields?.price) {
    const raw = p[mapping.fields.price]
    if (typeof raw !== "number") return null
    const isMinor = mapping.fields.priceUnit !== "major"
    const priceCents = isMinor ? raw : Math.round(raw * 100)
    let originalPriceCents: number | null = null
    if (mapping.fields.originalPrice && typeof p[mapping.fields.originalPrice] === "number") {
      const orig = p[mapping.fields.originalPrice] as number
      if (orig > raw) originalPriceCents = isMinor ? orig : Math.round(orig * 100)
    }
    return { priceCents, originalPriceCents }
  }

  // Heuristic: try minor-unit list price + sale/original pair, then major.
  for (const listField of PRICE_MINOR_FIELDS) {
    if (typeof p[listField] === "number") {
      const list = p[listField] as number
      for (const saleField of SALE_PRICE_MINOR_FIELDS) {
        if (typeof p[saleField] === "number" && (p[saleField] as number) < list) {
          return { priceCents: p[saleField] as number, originalPriceCents: list }
        }
      }
      for (const origField of ORIGINAL_PRICE_MINOR_FIELDS) {
        if (typeof p[origField] === "number" && (p[origField] as number) > list) {
          return { priceCents: list, originalPriceCents: p[origField] as number }
        }
      }
      return { priceCents: list, originalPriceCents: null }
    }
  }
  for (const listField of PRICE_MAJOR_FIELDS) {
    if (typeof p[listField] === "number") {
      const list = p[listField] as number
      for (const saleField of SALE_PRICE_MAJOR_FIELDS) {
        if (typeof p[saleField] === "number" && (p[saleField] as number) < list) {
          return {
            priceCents: Math.round((p[saleField] as number) * 100),
            originalPriceCents: Math.round(list * 100),
          }
        }
      }
      for (const origField of ORIGINAL_PRICE_MAJOR_FIELDS) {
        if (typeof p[origField] === "number" && (p[origField] as number) > list) {
          return {
            priceCents: Math.round(list * 100),
            originalPriceCents: Math.round((p[origField] as number) * 100),
          }
        }
      }
      return { priceCents: Math.round(list * 100), originalPriceCents: null }
    }
  }
  return null
}

function parseProduct(p: unknown, mapping?: ProductResponseMapping): ProductCard | null {
  if (!isPlainObject(p)) return null
  const f = mapping?.fields

  const nameRaw = readField(p, f?.name, NAME_FIELDS)
  if (typeof nameRaw !== "string" || !nameRaw.trim()) return null

  const price = extractPrice(p, mapping)
  if (!price) return null

  const idRaw = readField(p, f?.id, ID_FIELDS) ?? readField(p, f?.slug, SLUG_FIELDS) ?? nameRaw
  const slugRaw = readField(p, f?.slug, SLUG_FIELDS)
  const imageRaw = readField(p, f?.image, IMAGE_FIELDS)
  const stockRaw = readField(p, f?.stock, STOCK_FIELDS)
  const inStockRaw = readField(p, f?.inStock, IN_STOCK_FIELDS)
  const urlRaw = readField(p, f?.url, URL_FIELDS)

  const slug = typeof slugRaw === "string" ? slugRaw : null
  const stock = typeof stockRaw === "number" ? stockRaw : null
  const inStock = inStockRaw === false ? false : stock != null ? stock > 0 : true

  // Product URL precedence: explicit field on response > mapping template > none.
  let productUrl: string | null = typeof urlRaw === "string" ? urlRaw : null
  if (!productUrl && mapping?.productUrlTemplate) {
    productUrl = mapping.productUrlTemplate
      .replace(/\{slug\}/g, slug ? encodeURIComponent(slug) : "")
      .replace(/\{id\}/g, encodeURIComponent(String(idRaw)))
  }

  return {
    id: String(idRaw).trim(),
    slug,
    name: nameRaw.trim(),
    priceCents: price.priceCents,
    originalPriceCents: price.originalPriceCents,
    currency: mapping?.currency ?? "NGN",
    imageUrl: typeof imageRaw === "string" ? imageRaw : null,
    stock,
    inStock,
    productUrl,
  }
}

// ── Top-level extractor ───────────────────────────────────────────────────
function extractProductsFromResult(rec: ToolResultRecord): ProductCard[] {
  const parsed = unwrapToolBody(rec.rawResult)
  if (parsed == null) return []

  let items: unknown[] = []
  // Mapping can point us straight at the array/object — useful when the
  // response wraps data in container keys the heuristic doesn't recognise.
  if (rec.mapping?.itemsPath) {
    const arr = getByPath(parsed, rec.mapping.itemsPath)
    if (Array.isArray(arr)) items = arr
  } else if (rec.mapping?.singleItemPath) {
    const one = getByPath(parsed, rec.mapping.singleItemPath)
    if (one) items = [one]
  }
  if (items.length === 0) {
    items = findProductArray(parsed)
    if (items.length === 0) {
      const single = findSingleProduct(parsed)
      if (single) items = [single]
    }
  }

  return items
    .map((p) => parseProduct(p, rec.mapping))
    .filter((p): p is ProductCard => p !== null)
}

/**
 * Build a RichContent payload from the tool results collected in one LLM
 * turn. Returns null when no recognised payload was produced — the message
 * is then persisted as plain text and the widget renders the bubble alone.
 */
export function buildRichContent(results: ToolResultRecord[]): RichContent | null {
  if (results.length === 0) return null

  const seen = new Set<string>()
  const products: ProductCard[] = []
  for (const r of results) {
    for (const p of extractProductsFromResult(r)) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      products.push(p)
    }
  }

  if (products.length === 0) return null
  return { type: "products", products }
}
