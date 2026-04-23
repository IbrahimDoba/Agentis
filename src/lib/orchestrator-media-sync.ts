import type { Product } from "@/types"

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:4100"
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY

type ProductWithMedia = Product & { mediaId?: string }

function safeFilename(name: string, fallbackExt = "jpg"): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const base = cleaned || "product-image"
  return `${base}.${fallbackExt}`
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "image/gif") return "gif"
  return "jpg"
}

export async function syncProductImagesToOrchestratorMedia(
  agentId: string,
  products: Product[]
): Promise<ProductWithMedia[]> {
  const items: ProductWithMedia[] = products.map((p) => ({ ...p }))

  if (!ORCHESTRATOR_API_KEY || items.length === 0) {
    return items
  }

  const productsToSync = items.filter((p) => Boolean(p.imageUrl) && !p.mediaId)
  if (productsToSync.length === 0) {
    return items
  }

  for (const product of productsToSync) {
    try {
      const imageRes = await fetch(product.imageUrl as string)
      if (!imageRes.ok) continue

      const mimeType = imageRes.headers.get("content-type") || "image/jpeg"
      if (!mimeType.startsWith("image/")) continue

      const buffer = Buffer.from(await imageRes.arrayBuffer())
      const contentBase64 = buffer.toString("base64")
      const extension = extensionFromMime(mimeType)
      const filename = safeFilename(product.name || "product-image", extension)

      const payload = {
        agentId,
        filename,
        mimeType,
        description: `Product image for ${product.name} (productId:${product.id})`,
        tags: ["product-catalogue", `product-id:${product.id}`],
        contentBase64,
      }

      const uploadRes = await fetch(`${ORCHESTRATOR_URL}/v1/media/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!uploadRes.ok) continue
      const media = await uploadRes.json()
      if (media?.id) {
        product.mediaId = media.id as string
      }
    } catch (err) {
      console.warn("[orchestrator-media-sync] Product image sync failed", {
        agentId,
        productId: product.id,
        err,
      })
    }
  }

  return items
}
