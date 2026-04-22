import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { randomUUID } from "crypto"
import { uploadFile, deleteFile, r2Keys } from "../storage/r2.js"
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

        if (!body.mimeType.startsWith("image/")) {
            return reply.status(400).send({ error: "Only image uploads are supported" })
        }

        const buffer = Buffer.from(body.contentBase64, "base64")
        const sizeBytes = buffer.byteLength

        const MAX_SIZE = 5 * 1024 * 1024  // 5MB
        if (sizeBytes > MAX_SIZE) {
            return reply.status(400).send({ error: "File too large — max 5MB" })
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
