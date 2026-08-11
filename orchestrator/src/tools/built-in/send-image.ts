import type { ToolDefinition } from "../../providers/types.js"
import { getMediaItem } from "../../db/queries/media.js"
import { getSignedDownloadUrl } from "../../storage/r2.js"
import { dispatchMedia } from "../../orchestrator/response-dispatcher.js"
import { insertMessage } from "../../db/queries/conversations.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "tool:send_media" })

// Classify a media item by its stored mimeType so the worker sends it as the
// right WhatsApp message kind. Anything that isn't an image or video is sent as
// a document (PDF, docx, spec sheet, etc.).
export function mediaKindFromMime(mimeType: string): "image" | "video" | "document" {
    if (mimeType.startsWith("image/")) return "image"
    if (mimeType.startsWith("video/")) return "video"
    return "document"
}

export const SEND_MEDIA_TOOL: ToolDefinition = {
    type: "function",
    function: {
        name: "send_media",
        description: "Send a SINGLE item from the media library to the customer on WhatsApp — a product photo, a VIDEO (e.g. a demo/unboxing clip), or a DOCUMENT (e.g. a brochure, price list, spec sheet, catalogue PDF). Use this whenever a customer asks to SEE a product or asks for a video/brochure/document, OR when you proactively want to show a specific product. Match their request to the 'Available media' list in your system prompt (each item shows its type) and pass that item's ID. Only send items that are actually in that list; if they ask for something not there, say it's unavailable instead of sending something unrelated. Send one item per call.",
        parameters: {
            type: "object",
            properties: {
                media_id: {
                    type: "string",
                    description: "The ID of the media item to send. MUST be from the 'Available media' list in your system prompt.",
                },
                caption: {
                    type: "string",
                    description: "Optional short text sent along with the media (e.g. the product name, or a note about the document).",
                },
            },
            required: ["media_id"],
        },
    },
}

// Backward-compatible alias: some agents' prompts still say "send_image". The
// registration + dispatch accept both names, pointing at the same executor.
export const SEND_IMAGE_TOOL = SEND_MEDIA_TOOL

export async function executeSendMedia(args: Record<string, unknown>, opts: {
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

    const kind = mediaKindFromMime(item.mimeType)

    try {
        // Signed URL valid for 1 hour — the worker streams the file from here.
        const url = await getSignedDownloadUrl(item.r2Key, 3600)

        await dispatchMedia({
            agentId: opts.agentId,
            conversationId: opts.conversationId,
            toJid: opts.toJid,
            mediaUrl: url,
            caption,
            type: kind,
            // Documents need a filename the recipient sees; harmless for others.
            fileName: item.filename,
            mimeType: item.mimeType,
        })

        // Record an image in the conversation so it shows in the dashboard
        // thread (mediaUrl holds the R2 key; the dashboard signs it on view).
        // Images only for now — videos/documents don't render as chat images.
        if (kind === "image") {
          await insertMessage({
            conversationId: opts.conversationId,
            direction: "outbound",
            senderRole: "ai",
            content: caption ?? "",
            mediaUrl: item.r2Key,
          }).catch((e: any) => logger.warn({ mediaId, err: e?.message }, "Failed to persist outbound image message"))
        }

        logger.info({ mediaId, kind, agentId: opts.agentId }, "send_media executed successfully")
        return JSON.stringify({ success: true, message: `${kind} '${item.filename}' sent to customer.` })
    } catch (err: any) {
        logger.error({ mediaId, err: err.message }, "send_media failed")
        return JSON.stringify({ error: `Failed to send media: ${err.message}` })
    }
}

// Backward-compatible export name.
export const executeSendImage = executeSendMedia
