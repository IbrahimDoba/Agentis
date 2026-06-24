import type { ToolDefinition } from "../../providers/types.js"
import { getProductImages } from "../../db/queries/agents.js"
import { dispatchAlbum, dispatchMedia } from "../../orchestrator/response-dispatcher.js"
import { getRedis } from "../../queue/redis.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:send_product_photos" })

export const SEND_PRODUCT_PHOTOS_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "send_product_photos",
    description:
      "Send all photos (the different angles) of ONE specific product as a grouped WhatsApp album. " +
      "Use this whenever a customer asks about or shows interest in a SPECIFIC product — by name, type, " +
      "colour, or by tagging/quoting a photo — so they see every angle of just that product. " +
      "Pick product_id from the '## Product catalogue' list in your system prompt, matching by name/description. " +
      "Only send a product that is in that list; if they ask for something not there, tell them it's unavailable " +
      "instead of sending a random product. A product with one photo is sent as a single image; with several it's " +
      "sent as one album. Do NOT use this to show the whole range — use send_product_catalog for 'show me everything'. " +
      "Send a given product's photos AT MOST ONCE per conversation unless the customer explicitly asks to see that " +
      "product again (then set customerExplicitlyAskedAgain to true).",
    parameters: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "The id of the product to show — MUST be one from the '## Product catalogue' list in your system prompt.",
        },
        caption: {
          type: "string",
          description: "Optional short caption to send with the photos (e.g. the product name and price).",
        },
        customerExplicitlyAskedAgain: {
          type: "boolean",
          description: "Set true ONLY if this product's photos were already sent earlier in this conversation AND the customer is now explicitly asking to see them again.",
        },
      },
      required: ["product_id"],
    },
  },
}

// A conversation's lifetime is well under 24h, so this comfortably covers
// "don't re-send this product's photos within the chat" without leaking state.
const CLAIM_TTL = 86400 // seconds

export async function executeSendProductPhotos(
  args: Record<string, unknown>,
  opts: { agentId: string; conversationId: string; toJid: string }
): Promise<string> {
  const productId = typeof args.product_id === "string" ? args.product_id : ""
  const caption = typeof args.caption === "string" && args.caption.length > 0 ? args.caption : undefined
  const explicitlyAskedAgain = args.customerExplicitlyAskedAgain === true

  if (!productId) return JSON.stringify({ error: "product_id is required" })

  const product = await getProductImages(opts.agentId, productId)
  if (!product || product.images.length === 0) {
    return JSON.stringify({
      error: `No photos found for product '${productId}'. It may not be in the catalogue or has no images — tell the customer it's unavailable or describe it in text instead.`,
    })
  }

  // Per-(conversation, product) dedup so the same product's album isn't re-sent
  // (a credit drain + spammy) unless the customer explicitly asks again. Atomic
  // SET NX — only the first call for this product in this conversation wins.
  const redis = getRedis()
  const claimKey = `sent:productphotos:${opts.conversationId}:${productId}`
  if (!explicitlyAskedAgain) {
    const claimed = await redis.set(claimKey, "1", "EX", CLAIM_TTL, "NX")
    if (claimed !== "OK") {
      logger.info({ agentId: opts.agentId, conversationId: opts.conversationId, productId }, "send_product_photos skipped — already sent this product")
      return JSON.stringify({
        skipped: true,
        message: `You already sent ${product.name || "this product"}'s photos to this customer in this conversation. Do NOT resend them — reply briefly referencing them (e.g. "I shared the photos above 👆") and answer any question about it.`,
      })
    }
  }

  try {
    const intro = caption || product.name || undefined

    // One photo → a plain single image (an album of one is pointless).
    if (product.images.length === 1) {
      await dispatchMedia({
        agentId: opts.agentId,
        conversationId: opts.conversationId,
        toJid: opts.toJid,
        mediaUrl: product.images[0],
        caption: intro,
      })
      logger.info({ agentId: opts.agentId, conversationId: opts.conversationId, productId }, "send_product_photos sent single image")
      return JSON.stringify({
        success: true,
        message: `Sent a photo of ${product.name || "the product"}. Confirm its price/details and offer to help further.`,
      })
    }

    // Several photos → one grouped album, each captioned with the product name
    // so a quote-reply carries the product identity back.
    const { sent } = await dispatchAlbum({
      agentId: opts.agentId,
      toJid: opts.toJid,
      images: product.images,
      captions: product.images.map(() => product.name || ""),
      title: intro,
    })
    logger.info({ agentId: opts.agentId, conversationId: opts.conversationId, productId, sent }, "send_product_photos sent album")
    return JSON.stringify({
      success: true,
      message: `Sent ${sent} photos of ${product.name || "the product"} as an album. Confirm its price/details and offer to help further.`,
    })
  } catch (err) {
    // Release the claim so a retry / later real send isn't permanently blocked.
    if (!explicitlyAskedAgain) await redis.del(claimKey).catch(() => {})
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ agentId: opts.agentId, productId, err: message }, "send_product_photos failed")
    return JSON.stringify({ error: `Failed to send the product photos: ${message}` })
  }
}
