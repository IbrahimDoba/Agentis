import type { ToolDefinition } from "../../providers/types.js"
import { getAgentProductAlbum } from "../../db/queries/agents.js"
import { dispatchAlbum } from "../../orchestrator/response-dispatcher.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:send_product_catalog" })

export const SEND_PRODUCT_ALBUM_TOOL: ToolDefinition = {
    type: "function",
    function: {
        name: "send_product_catalog",
        description:
            "Send the business's ENTIRE product catalogue as one WhatsApp photo album. " +
            "Use this ONLY when the customer wants to browse the whole range / see everything — e.g. " +
            "'let me see what you have', 'show me all your caps', 'what do you sell', 'send me everything'. " +
            "Do NOT use this for a SPECIFIC product or a particular type: if the customer asks about one item " +
            "(by name, type, colour, or by tagging/quoting a photo), send just that one product's image with " +
            "send_image instead — never dump the whole album for a single-product question. " +
            "Send the album at most once per conversation unless they explicitly ask to see everything again. " +
            "After sending, follow up with a short friendly message inviting them to ask about any item.",
        parameters: { type: "object", properties: {}, required: [] },
    },
}

export async function executeSendProductAlbum(
    _args: Record<string, unknown>,
    opts: { agentId: string; toJid: string }
): Promise<string> {
    const { images, captions, title } = await getAgentProductAlbum(opts.agentId)

    if (images.length === 0) {
        return JSON.stringify({ error: "No product images are available to send. Describe products in text instead." })
    }

    try {
        const { sent } = await dispatchAlbum({
            agentId: opts.agentId,
            toJid: opts.toJid,
            images,
            captions,
            title: title || undefined,
        })
        logger.info({ agentId: opts.agentId, sent }, "send_product_catalog executed")
        return JSON.stringify({
            success: true,
            message: `Sent ${sent} product photos as an album. Follow up with a short friendly message inviting them to ask about any item.`,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error({ agentId: opts.agentId, err: message }, "send_product_catalog failed")
        return JSON.stringify({ error: `Failed to send the catalogue: ${message}` })
    }
}
