import type { ToolDefinition } from "../../providers/types.js"
import { getAgentProductAlbum } from "../../db/queries/agents.js"
import { getLastProductAlbumSentAt, markProductAlbumSent } from "../../db/queries/conversations.js"
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
            "The album costs many credits, so it is sent AT MOST ONCE per conversation. After it has been sent, " +
            "do NOT call this again unless the customer EXPLICITLY asks to see the whole catalogue/everything a " +
            "second time (e.g. 'can you resend all of them', 'show me everything again') — and in that case set " +
            "customerExplicitlyAskedAgain to true. After sending, follow up with a short friendly message inviting " +
            "them to ask about any item.",
        parameters: {
            type: "object",
            properties: {
                customerExplicitlyAskedAgain: {
                    type: "boolean",
                    description:
                        "Set true ONLY if the album was already sent earlier in this conversation AND the customer " +
                        "is now explicitly asking to see the entire catalogue again. Leave false/omit for the first " +
                        "send or any proactive/automatic send.",
                },
            },
            required: [],
        },
    },
}

export async function executeSendProductAlbum(
    args: Record<string, unknown>,
    opts: { agentId: string; conversationId: string; toJid: string }
): Promise<string> {
    // Hard dedup: once the album has been sent to this conversation, only resend
    // it when the customer explicitly asked to see everything again. Stops the
    // model re-dumping the whole catalogue on follow-up messages and burning
    // credits — single-item questions are answered with send_image instead.
    const alreadySent = (await getLastProductAlbumSentAt(opts.conversationId)) !== null
    const explicitlyAskedAgain = args.customerExplicitlyAskedAgain === true
    if (alreadySent && !explicitlyAskedAgain) {
        logger.info({ agentId: opts.agentId, conversationId: opts.conversationId }, "send_product_catalog skipped — already sent")
        return JSON.stringify({
            skipped: true,
            message:
                "The full catalogue was already sent to this customer earlier in this conversation. Do NOT resend it. " +
                "Reply briefly pointing them to it (e.g. 'I shared the full collection above 👆') and offer to show or " +
                "give details on a specific item — use send_image for a single product they name.",
        })
    }

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
        await markProductAlbumSent(opts.conversationId)
        logger.info({ agentId: opts.agentId, conversationId: opts.conversationId, sent }, "send_product_catalog executed")
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
