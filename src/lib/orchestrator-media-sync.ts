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

  if (!ORCHESTRATOR_API_KEY) {
    console.log("[orchestrator-media-sync] Skipping — ORCHESTRATOR_API_KEY not set")
    return items
  }

  if (items.length === 0) {
    console.log("[orchestrator-media-sync] Skipping — no products")
    return items
  }

  const productsToSync = items.filter((p) => Boolean(p.imageUrl) && !p.mediaId)
  console.log(`[orchestrator-media-sync] ${productsToSync.length}/${items.length} products need syncing`, {
    agentId,
    toSync: productsToSync.map((p) => ({ id: p.id, name: p.name, hasImage: !!p.imageUrl, hasMediaId: !!p.mediaId })),
  })

  if (productsToSync.length === 0) {
    return items
  }

  for (const product of productsToSync) {
    try {
      console.log(`[orchestrator-media-sync] Fetching image for "${product.name}"`, { imageUrl: product.imageUrl })
      const imageRes = await fetch(product.imageUrl as string)
      if (!imageRes.ok) {
        console.warn(`[orchestrator-media-sync] Image fetch failed for "${product.name}"`, { status: imageRes.status })
        continue
      }

      const mimeType = imageRes.headers.get("content-type") || "image/jpeg"
      if (!mimeType.startsWith("image/")) {
        console.warn(`[orchestrator-media-sync] Non-image content-type for "${product.name}"`, { mimeType })
        continue
      }

      const buffer = Buffer.from(await imageRes.arrayBuffer())
      const contentBase64 = buffer.toString("base64")
      const extension = extensionFromMime(mimeType)
      const filename = safeFilename(product.name || "product-image", extension)

      const description = [
        product.name,
        product.price ? `Price: ${product.price}` : null,
        product.description || null,
      ].filter(Boolean).join(" — ")

      const payload = {
        agentId,
        filename,
        mimeType,
        description,
        tags: ["product-catalogue", `product-id:${product.id}`],
        contentBase64,
      }

      console.log(`[orchestrator-media-sync] Uploading "${product.name}" to orchestrator`, { filename, description })
      const uploadRes = await fetch(`${ORCHESTRATOR_URL}/v1/media/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ORCHESTRATOR_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "")
        console.warn(`[orchestrator-media-sync] Upload failed for "${product.name}"`, { status: uploadRes.status, errText })
        continue
      }

      const media = await uploadRes.json()
      if (media?.id) {
        product.mediaId = media.id as string
        console.log(`[orchestrator-media-sync] Synced "${product.name}" → mediaId=${media.id}`)
      }
    } catch (err) {
      console.warn("[orchestrator-media-sync] Product image sync failed", {
        agentId,
        productId: product.id,
        productName: product.name,
        err,
      })
    }
  }

  return items
}
