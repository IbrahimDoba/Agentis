import { resolveProvider } from "../providers/registry.js"
import { config } from "../config.js"
import { insertChunks, searchChunks } from "../db/queries/documents.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "rag-indexer" })

const EMBED_MODEL = config.OPENAI_EMBEDDING_MODEL

/**
 * Embed chunks of text and insert them into the DocumentChunk table.
 * Called by the embed-worker after document text is extracted and chunked.
 */
export async function indexChunks(
    documentId: string,
    agentId: string,
    chunks: string[]
): Promise<void> {
    if (chunks.length === 0) return

    const provider = resolveProvider(EMBED_MODEL)

    // Batch embed in groups of 100 (OpenAI limit is 2048 per request, 100 is safe)
    const BATCH_SIZE = 100
    const allChunks: { documentId: string; agentId: string; chunkIndex: number; content: string; embedding: number[] }[] = []

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE)
        const result = await provider.embed({ model: EMBED_MODEL, texts: batch })

        for (let j = 0; j < batch.length; j++) {
            allChunks.push({
                documentId,
                agentId,
                chunkIndex: i + j,
                content: batch[j]!,
                embedding: result.embeddings[j]!,
            })
        }

        logger.info({ documentId, batchStart: i, batchSize: batch.length }, "Embedded chunk batch")
    }

    await insertChunks(allChunks)
    logger.info({ documentId, totalChunks: allChunks.length }, "All chunks indexed")
}

/**
 * Retrieve the top-k most relevant chunks for a query text.
 * Returns formatted strings ready for system prompt injection.
 */
export async function retrieveRelevantChunks(
    agentId: string,
    queryText: string,
    limit = 5
): Promise<{ content: string; filename: string; similarity: number }[]> {
    if (!queryText.trim()) return []

    const provider = resolveProvider(EMBED_MODEL)
    const result = await provider.embed({ model: EMBED_MODEL, texts: [queryText] })
    const queryEmbedding = result.embeddings[0]!

    const chunks = await searchChunks(agentId, queryEmbedding, limit)
    return chunks
}
