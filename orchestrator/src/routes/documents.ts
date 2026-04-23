import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { randomUUID } from "crypto"
import { uploadFile, deleteFile, r2Keys } from "../storage/r2.js"
import {
    insertDocument,
    listDocuments,
    getDocument,
    deleteDocument,
} from "../db/queries/documents.js"
import { embedQueue } from "../queue/queues.js"
import { SUPPORTED_MIME_TYPES } from "../rag/extractor.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "routes/documents" })

const ListQuerySchema = z.object({ agentId: z.string().min(1) })
const DocIdSchema = z.object({ id: z.string().uuid() })

export async function documentsRoutes(app: FastifyInstance) {
    /**
     * POST /v1/documents/upload
     * Body: multipart/form-data
     *   - agentId: string
     *   - file: binary
     */
    app.post("/documents/upload", async (req, reply) => {
        // Parse multipart manually — Fastify needs @fastify/multipart
        // For now we accept a JSON body with base64 content for simplicity
        // The dashboard will send: { agentId, filename, mimeType, contentBase64 }
        const body = req.body as {
            agentId?: string
            filename?: string
            mimeType?: string
            contentBase64?: string
        }

        if (!body.agentId || !body.filename || !body.mimeType || !body.contentBase64) {
            return reply.status(400).send({ error: "agentId, filename, mimeType, contentBase64 are required" })
        }

        if (!SUPPORTED_MIME_TYPES.includes(body.mimeType)) {
            return reply.status(400).send({
                error: `Unsupported file type: ${body.mimeType}. Supported: ${SUPPORTED_MIME_TYPES.join(", ")}`,
            })
        }

        const buffer = Buffer.from(body.contentBase64, "base64")
        const sizeBytes = buffer.byteLength

        const MAX_SIZE = 10 * 1024 * 1024  // 10MB
        if (sizeBytes > MAX_SIZE) {
            return reply.status(400).send({ error: "File too large — max 10MB" })
        }

        const docId = randomUUID()
        const r2Key = r2Keys.document(body.agentId, docId, body.filename)

        // 1. Upload raw file to R2 (for potential re-processing later)
        await uploadFile(r2Key, buffer, body.mimeType)

        // 2. Insert Document row (status = pending)
        const doc = await insertDocument({
            agentId: body.agentId,
            filename: body.filename,
            mimeType: body.mimeType,
            sizeBytes,
            r2Key,
        })

        // 3. Enqueue embed job (pass buffer as array for JSON serialisation)
        await embedQueue.add(
            "embed-document",
            { documentId: doc.id, fileBuffer: Array.from(buffer) },
            { jobId: `embed-${doc.id}` }
        )

        logger.info({ docId: doc.id, agentId: body.agentId, filename: body.filename }, "Document upload queued")

        return reply.status(202).send({ id: doc.id, status: "pending" })
    })

    /**
     * GET /v1/documents?agentId=xxx
     */
    app.get("/documents", async (req, reply) => {
        const parsed = ListQuerySchema.safeParse(req.query)
        if (!parsed.success) return reply.status(400).send({ error: "agentId required" })

        const docs = await listDocuments(parsed.data.agentId)
        return reply.send({ documents: docs })
    })

    /**
     * GET /v1/documents/:id
     */
    app.get("/documents/:id", async (req, reply) => {
        const parsed = DocIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid document id" })

        const doc = await getDocument(parsed.data.id)
        if (!doc) return reply.status(404).send({ error: "Document not found" })
        return reply.send(doc)
    })

    /**
     * DELETE /v1/documents/:id
     * Deletes from R2 + cascades chunks in DB
     */
    app.delete("/documents/:id", async (req, reply) => {
        const parsed = DocIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid document id" })

        const r2Key = await deleteDocument(parsed.data.id)
        if (!r2Key) return reply.status(404).send({ error: "Document not found" })

        // Delete from R2 (don't block response on this)
        deleteFile(r2Key).catch((err) =>
            logger.warn({ id: parsed.data.id, err: err.message }, "Failed to delete doc from R2")
        )

        logger.info({ id: parsed.data.id }, "Document deleted")
        return reply.status(204).send()
    })
}
