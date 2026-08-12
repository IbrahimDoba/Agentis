import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { randomUUID } from "crypto"
import { uploadFile, deleteFile, r2Keys, getSignedDownloadUrl } from "../storage/r2.js"
import {
    insertMediaItem,
    listMediaItems,
    getMediaItem,
    deleteMediaItem,
} from "../db/queries/media.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "routes/media" })

const ListQuerySchema = z.object({ agentId: z.string().min(1) })
const MediaIdSchema = z.object({ id: z.string().uuid() })

export async function mediaRoutes(app: FastifyInstance) {
    /**
     * POST /v1/media/upload
     * Body: JSON
     */
    app.post("/media/upload", async (req, reply) => {
        const body = req.body as {
            agentId?: string
            filename?: string
            mimeType?: string
            description?: string
            tags?: string[]
            contentBase64?: string
        }

        if (!body.agentId || !body.filename || !body.mimeType || !body.contentBase64 || !body.description) {
            return reply.status(400).send({ error: "agentId, filename, mimeType, description, contentBase64 are required" })
        }

        // Accept images, videos, and documents. Per-type size caps sized to
        // WhatsApp's send limits (and to keep base64-in-JSON bodies sane).
        const mime = body.mimeType
        const isImage = mime.startsWith("image/")
        const isVideo = mime.startsWith("video/")
        const DOC_MIMES = new Set([
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/csv",
        ])
        const isDocument = DOC_MIMES.has(mime)
        if (!isImage && !isVideo && !isDocument) {
            return reply.status(400).send({ error: "Unsupported file type. Allowed: images, videos, and documents (PDF, Word, Excel, PowerPoint, txt, csv)." })
        }

        const buffer = Buffer.from(body.contentBase64, "base64")
        const sizeBytes = buffer.byteLength

        // WhatsApp caps: image ~5MB, video ~16MB, documents up to ~100MB (we cap
        // at 25MB here since the payload is base64-in-JSON).
        const MAX_SIZE = isVideo ? 16 * 1024 * 1024 : isDocument ? 25 * 1024 * 1024 : 5 * 1024 * 1024
        if (sizeBytes > MAX_SIZE) {
            const mb = Math.round(MAX_SIZE / 1024 / 1024)
            return reply.status(400).send({ error: `File too large — max ${mb}MB for this type.` })
        }

        const mediaId = randomUUID()
        const r2Key = r2Keys.media(body.agentId, mediaId, body.filename)

        // 1. Upload raw file to R2
        await uploadFile(r2Key, buffer, body.mimeType)

        // 2. Insert MediaItem row
        const item = await insertMediaItem({
            agentId: body.agentId,
            filename: body.filename,
            mimeType: body.mimeType,
            r2Key,
            description: body.description,
            tags: body.tags ?? [],
        })

        logger.info({ mediaId: item.id, agentId: body.agentId, filename: body.filename }, "Media uploaded")

        return reply.status(201).send(item)
    })

    /**
     * GET /v1/media?agentId=xxx
     */
    app.get("/media", async (req, reply) => {
        const parsed = ListQuerySchema.safeParse(req.query)
        if (!parsed.success) return reply.status(400).send({ error: "agentId required" })

        const items = await listMediaItems(parsed.data.agentId)
        return reply.send({ media: items })
    })

    /**
     * GET /v1/media/sign?key=<r2Key>
     * Short-lived signed URL for a stored object, so the dashboard can display
     * private conversation images. The caller (Next backend) has already verified
     * the requester owns the message. Restricted to media key prefixes so it
     * can't sign arbitrary bucket objects. Registered BEFORE /media/:id so "sign"
     * isn't captured as an :id param.
     */
    app.get("/media/sign", async (req, reply) => {
        const key = (req.query as { key?: string })?.key
        if (!key || (!key.startsWith("conversation-media/") && !key.startsWith("media/"))) {
            return reply.status(400).send({ error: "valid media key required" })
        }
        const url = await getSignedDownloadUrl(key, 3600)
        return reply.send({ url })
    })

    /**
     * GET /v1/media/:id
     */
    app.get("/media/:id", async (req, reply) => {
        const parsed = MediaIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid media id" })

        const item = await getMediaItem(parsed.data.id)
        if (!item) return reply.status(404).send({ error: "Media not found" })
        return reply.send(item)
    })

    /**
     * DELETE /v1/media/:id
     */
    app.delete("/media/:id", async (req, reply) => {
        const parsed = MediaIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid media id" })

        const r2Key = await deleteMediaItem(parsed.data.id)
        if (!r2Key) return reply.status(404).send({ error: "Media not found" })

        deleteFile(r2Key).catch((err) =>
            logger.warn({ id: parsed.data.id, err: err.message }, "Failed to delete media from R2")
        )

        logger.info({ id: parsed.data.id }, "Media deleted")
        return reply.status(204).send()
    })
}
