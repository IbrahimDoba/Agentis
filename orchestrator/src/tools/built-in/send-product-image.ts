import type { ToolDefinition } from "../../providers/types.js"
import { dispatchMedia } from "../../orchestrator/response-dispatcher.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:send_product_image" })

// Sends an image the AI got from an external product tool (e.g. a webhook's
// `imageUrl`) to the customer as a REAL WhatsApp image — the piece that
// send_image (media-library only) can't do for webhook-based catalogues.
export const SEND_PRODUCT_IMAGE_TOOL: ToolDefinition = {
    type: "function",
    function: {
        name: "send_product_image",
        description: "Send a product's photo to the customer as an actual WhatsApp image. Use this whenever a customer wants to SEE a product: take the product's `imageUrl` (exactly as returned by search_products / get_product / recommend_products) and pass it as image_url, with a short caption (e.g. the product name + price). NEVER paste a raw image URL into your text reply — always send the photo with this tool instead. Only send images for products your tools actually returned; call it once per product image.",
        parameters: {
            type: "object",
            properties: {
                image_url: {
                    type: "string",
                    description: "The product's image URL, copied verbatim from a product tool's `imageUrl` field.",
                },
                caption: {
                    type: "string",
                    description: "Optional short caption sent with the image, e.g. the product name and price.",
                },
            },
            required: ["image_url"],
        },
    },
}

export async function executeSendProductImage(args: Record<string, unknown>, opts: {
    agentId: string
    conversationId: string
    toJid: string
}): Promise<string> {
    const imageUrl = typeof args.image_url === "string" ? args.image_url.trim() : ""
    const caption = typeof args.caption === "string" && args.caption.trim() ? args.caption.trim() : undefined

    if (!imageUrl) return JSON.stringify({ error: "image_url is required" })
    // Only accept a real http(s) URL from a tool result — never a made-up path.
    if (!/^https?:\/\//i.test(imageUrl)) {
        return JSON.stringify({ error: "image_url must be a full http(s) URL taken from a product tool result" })
    }
    if (!opts.toJid) {
        return JSON.stringify({ error: "No WhatsApp recipient for this conversation — can't send an image here." })
    }

    try {
        await dispatchMedia({
            agentId: opts.agentId,
            conversationId: opts.conversationId,
            toJid: opts.toJid,
            mediaUrl: imageUrl,
            caption,
        })
        logger.info({ agentId: opts.agentId }, "send_product_image executed successfully")
        return JSON.stringify({ success: true, message: "Product image sent to the customer." })
    } catch (err: any) {
        logger.error({ agentId: opts.agentId, err: err?.message }, "send_product_image failed")
        return JSON.stringify({ error: `Failed to send image: ${err?.message ?? "unknown error"}` })
    }
}
