import { Worker } from "bullmq"
import { getRedis } from "../redis.js"
import { getDocument, updateDocumentStatus } from "../../db/queries/documents.js"
import { extractText } from "../../rag/extractor.js"
import { chunkText } from "../../rag/chunker.js"
import { indexChunks } from "../../rag/indexer.js"
import { uploadFile, r2Keys } from "../../storage/r2.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "embed-worker" })

export interface EmbedJobData {
    documentId: string
    fileBuffer: number[]  // serialized Buffer (arrays are JSON-safe)
}

export function startEmbedWorker() {
    const worker = new Worker<EmbedJobData>(
        "orchestrator-embed",
        async (job) => {
            const { documentId, fileBuffer } = job.data
            const buffer = Buffer.from(fileBuffer)

            const doc = await getDocument(documentId)
            if (!doc) {
                logger.warn({ documentId }, "Document not found — skipping embed job")
                return
            }

            logger.info({ documentId, filename: doc.filename }, "Starting embed job")

            try {
                // 1. Update status to chunking
                await updateDocumentStatus(documentId, "chunking")

                // 2. Extract text
                const text = await extractText(buffer, doc.mimeType)
                if (!text.trim()) {
                    await updateDocumentStatus(documentId, "failed", { error: "No text could be extracted from document" })
                    return
                }

                // 3. Chunk text
                const chunks = chunkText(text)
                logger.info({ documentId, chunkCount: chunks.length }, "Text chunked")

                // 4. Update status to embedding
                await updateDocumentStatus(documentId, "embedding")

                // 5. Embed + index chunks
                await indexChunks(documentId, doc.agentId, chunks)

                // 6. Mark ready
                await updateDocumentStatus(documentId, "ready", { chunkCount: chunks.length })
                logger.info({ documentId, chunkCount: chunks.length }, "Document embed complete")

            } catch (err: any) {
                logger.error({ documentId, err: err.message }, "Embed job failed")
                await updateDocumentStatus(documentId, "failed", { error: err.message })
                throw err  // rethrow so BullMQ retries
            }
        },
        {
            connection: getRedis(),
            concurrency: 5,
        }
    )

    worker.on("failed", (job, err) => {
        logger.error({ jobId: job?.id, err: err.message }, "Embed worker job failed permanently")
    })

    logger.info("Embed worker started")
    return worker
}
