import type { Product } from "@/types"

export interface CatalogMergeStats {
  /** New WhatsApp products not previously in the catalogue. */
  added: number
  /** Previously-synced WhatsApp products whose fields changed. */
  updated: number
  /** Previously-synced WhatsApp products that are identical to before. */
  unchanged: number
  /** Manually-added Dailzero products left untouched. */
  manualKept: number
  /** Previously-synced products no longer present in WhatsApp (kept, flagged). */
  staleFromWhatsApp: number
}

export interface CatalogMergeResult {
  products: Product[]
  stats: CatalogMergeStats
}

/** Stable merge key for a WhatsApp-sourced product: SKU first, WA id as fallback. */
function whatsappKey(p: Product): string | null {
  if (p.source !== "whatsapp") return null
  return p.retailerId || p.waProductId || null
}

// The WhatsApp-owned fields — the only ones a sync refreshes on a matched product.
function sameWhatsAppFields(a: Product, b: Product): boolean {
  return (
    a.name === b.name &&
    (a.description ?? "") === (b.description ?? "") &&
    (a.price ?? "") === (b.price ?? "") &&
    (a.imageUrl ?? "") === (b.imageUrl ?? "") &&
    JSON.stringify(a.images ?? []) === JSON.stringify(b.images ?? [])
  )
}

/**
 * Merge a freshly-fetched WhatsApp catalogue into the agent's existing products.
 *
 * Rules (smart merge — never a blind overwrite):
 * - Match by retailerId (SKU), falling back to WhatsApp's product id.
 * - A matched product is UPDATED in place (keeps its Dailzero id + mediaId;
 *   refreshes name/price/description/images from WhatsApp).
 * - An unmatched incoming product is ADDED.
 * - Manually-added products (source !== "whatsapp") are ALWAYS kept untouched.
 * - Previously-synced products missing from the new catalogue are KEPT (not
 *   deleted) and counted as stale so the UI can surface "no longer on WhatsApp".
 *
 * Existing order is preserved; genuinely new products are appended.
 *
 * `incoming` must already be mapped to the app Product shape with
 * source:"whatsapp", a formatted price, and re-hosted image URLs.
 */
export function mergeCatalog(existing: Product[], incoming: Product[]): CatalogMergeResult {
  const stats: CatalogMergeStats = { added: 0, updated: 0, unchanged: 0, manualKept: 0, staleFromWhatsApp: 0 }

  const incomingByKey = new Map<string, Product>()
  for (const p of incoming) {
    const k = p.retailerId || p.waProductId
    if (k) incomingByKey.set(k, p)
  }

  const consumed = new Set<string>()
  const products: Product[] = []

  // Walk existing in order: keep manual, update/keep WhatsApp ones.
  for (const prior of existing) {
    const key = whatsappKey(prior)
    if (!key) {
      products.push(prior)
      stats.manualKept++
      continue
    }
    const inc = incomingByKey.get(key)
    if (!inc) {
      products.push(prior) // synced before, gone from WhatsApp now — keep it
      stats.staleFromWhatsApp++
      continue
    }
    consumed.add(key)
    const merged: Product = {
      ...prior, // preserve id + mediaId + any Dailzero-only fields
      name: inc.name,
      description: inc.description,
      price: inc.price,
      link: inc.link ?? prior.link,
      imageUrl: inc.imageUrl,
      images: inc.images,
      retailerId: inc.retailerId,
      waProductId: inc.waProductId,
      source: "whatsapp",
    }
    if (sameWhatsAppFields(prior, merged)) {
      products.push(prior)
      stats.unchanged++
    } else {
      products.push(merged)
      stats.updated++
    }
  }

  // Append genuinely new WhatsApp products (not matched to anything existing).
  for (const inc of incoming) {
    const key = inc.retailerId || inc.waProductId
    if (!key || consumed.has(key)) {
      if (!key) {
        // No stable key at all — can't dedupe; add it (rare).
        products.push({ ...inc, source: "whatsapp" })
        stats.added++
      }
      continue
    }
    consumed.add(key)
    products.push({ ...inc, source: "whatsapp" })
    stats.added++
  }

  return { products, stats }
}
