import type { ToolDefinition } from "../../providers/types.js"
import { getMediaItem } from "../../db/queries/media.js"
import { getSignedDownloadUrl } from "../../storage/r2.js"
import { dispatchMedia } from "../../orchestrator/response-dispatcher.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:send_image" })

export const SEND_IMAGE_TOOL: ToolDefinition = {
    type: "function",
    function: {
        name: "send_image",
        description: "Send an image from the media library to the customer. Use this only when the customer asks for a picture or when showing a specific product.",
        parameters: {
            type: "object",
            properties: {
                media_id: {
                    type: "string",
                    description: "The ID of the media item to send. MUST be from the 'Available media' list in your system prompt.",
                },
                caption: {
                    type: "string",
                    description: "Optional text to send along with the image.",
                },
            },
            required: ["media_id"],
        },
    },
}

export async function executeSendImage(args: Record<string, unknown>, opts: {
    agentId: string
    conversationId: string
    toJid: string
}): Promise<string> {
    const mediaId = args.media_id as string
    const caption = (args.caption as string) || undefined

    if (!mediaId) return JSON.stringify({ error: "media_id is required" })

    const item = await getMediaItem(mediaId)
    if (!item || item.agentId !== opts.agentId) {
        return JSON.stringify({ error: `Media ID ${mediaId} not found in library` })
    }

    try {
        // Generate signed URL valid for 1 hour
        const url = await getSignedDownloadUrl(item.r2Key, 3600)

        // Dispatch to worker
        await dispatchMedia({
            agentId: opts.agentId,
            conversationId: opts.conversationId,
            toJid: opts.toJid,
            mediaUrl: url,
            caption,
        })

        logger.info({ mediaId, agentId: opts.agentId }, "send_image executed successfully")
        return JSON.stringify({ success: true, message: `Image '${item.filename}' sent to customer.` })
    } catch (err: any) {
        logger.error({ mediaId, err: err.message }, "send_image failed")
        return JSON.stringify({ error: `Failed to send image: ${err.message}` })
    }
}
