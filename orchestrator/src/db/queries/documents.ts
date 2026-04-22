import { sql } from "../client.js"

export interface Document {
    id: string
    agentId: string
    filename: string
    mimeType: string
    sizeBytes: number
    r2Key: string
    status: "pending" | "chunking" | "embedding" | "ready" | "failed"
    error: string | null
    chunkCount: number
    createdAt: Date
}

export interface DocumentChunk {
    id: string
    documentId: string
    agentId: string
    chunkIndex: number
    content: string
}

export async function insertDocument(doc: {
    agentId: string
    filename: string
    mimeType: string
    sizeBytes: number
    r2Key: string
}): Promise<Document> {
    const rows = await sql<Document[]>`
    INSERT INTO "Document" ("agentId", filename, "mimeType", "sizeBytes", "r2Key", status, "chunkCount")
    VALUES (${doc.agentId}, ${doc.filename}, ${doc.mimeType}, ${doc.sizeBytes}, ${doc.r2Key}, 'pending', 0)
    RETURNING *
  `
    return rows[0]!
}

export async function getDocument(id: string): Promise<Document | null> {
    const rows = await sql<Document[]>`
    SELECT * FROM "Document" WHERE id = ${id} LIMIT 1
  `
    return rows[0] ?? null
}

export async function listDocuments(agentId: string): Promise<Document[]> {
    return sql<Document[]>`
    SELECT * FROM "Document"
    WHERE "agentId" = ${agentId}
    ORDER BY "createdAt" DESC
  `
}

export async function updateDocumentStatus(
    id: string,
    status: Document["status"],
    extra?: { error?: string; chunkCount?: number }
): Promise<void> {
    await sql`
    UPDATE "Document"
    SET status = ${status},
        error = ${extra?.error ?? null},
        "chunkCount" = COALESCE(${extra?.chunkCount ?? null}, "chunkCount")
    WHERE id = ${id}
  `
}

export async function deleteDocument(id: string): Promise<string | null> {
    const rows = await sql<{ r2Key: string }[]>`
    DELETE FROM "Document" WHERE id = ${id} RETURNING "r2Key"
  `
    return rows[0]?.r2Key ?? null
}

export async function insertChunks(chunks: {
    documentId: string
    agentId: string
    chunkIndex: number
    content: string
    embedding: number[]
}[]): Promise<void> {
    if (chunks.length === 0) return
    // Insert one at a time to use pgvector format properly
    for (const chunk of chunks) {
        const embeddingStr = `[${chunk.embedding.join(",")}]`
        await sql`
      INSERT INTO "DocumentChunk" ("documentId", "agentId", "chunkIndex", content, embedding)
      VALUES (
        ${chunk.documentId},
        ${chunk.agentId},
        ${chunk.chunkIndex},
        ${chunk.content},
        ${embeddingStr}::vector
      )
    `
    }
}

export async function searchChunks(
    agentId: string,
    queryEmbedding: number[],
    limit = 5
): Promise<{ content: string; filename: string; similarity: number }[]> {
    const embeddingStr = `[${queryEmbedding.join(",")}]`
    return sql<{ content: string; filename: string; similarity: number }[]>`
    SELECT
      dc.content,
      d.filename,
      1 - (dc.embedding <=> ${embeddingStr}::vector) AS similarity
    FROM "DocumentChunk" dc
    JOIN "Document" d ON d.id = dc."documentId"
    WHERE dc."agentId" = ${agentId}
      AND d.status = 'ready'
    ORDER BY dc.embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `
}
