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
    sourceType: "file" | "web"
    sourceUrl: string | null
    crawlStatus: CrawlStatus | null
    lastCrawledAt: Date | null
    crawlMeta: CrawlMeta | null
}

/**
 * Progress of a crawl. Deliberately separate from `status`: retrieval gates on
 * status='ready', so writing `status` during a re-crawl would blank the agent's
 * knowledge for the two minutes it runs. The old content keeps serving until
 * the new content commits.
 */
export type CrawlStatus = "queued" | "crawling" | "embedding" | "failed"

export interface CrawlMeta {
    pagesCrawled?: number
    pagesFailed?: number
    pagesSkipped?: number
    deadlineHit?: boolean
    unreachable?: boolean
    jsRendered?: boolean
    failure?: string
    error?: string
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

/**
 * Delete a document, scoped to its agent.
 *
 * `agentId` is not optional: without it this deleted any document by id, so an
 * authenticated user could delete another tenant's document by guessing one.
 * Returns null when the document does not exist OR belongs to someone else —
 * the caller cannot tell those apart, which is the point. Returns the row (not
 * the key) on success, because a crawled site has an empty r2Key and a bare
 * string return makes a successful delete indistinguishable from a miss.
 */
export async function deleteDocument(
    id: string,
    agentId: string
): Promise<{ r2Key: string } | null> {
    const rows = await sql<{ r2Key: string }[]>`
    DELETE FROM "Document"
    WHERE id = ${id} AND "agentId" = ${agentId}
    RETURNING "r2Key"
  `
    return rows[0] ?? null
}

/**
 * Replace a document's chunks with a new set, in one transaction.
 *
 * This supersedes the previous row-by-row insert, which had no transaction and
 * no delete-first: a BullMQ retry after a partial insert duplicated chunks. That
 * was already a live bug on the file-upload path, and a 25-page crawl makes it
 * far more likely, so both paths go through here now.
 *
 * The document row is locked FOR UPDATE first, so two crawls of the same link
 * cannot interleave their deletes and inserts.
 */
export async function replaceChunks(
    documentId: string,
    agentId: string,
    chunks: { content: string; embedding: number[]; metadata?: Record<string, unknown> }[]
): Promise<number> {
    return sql.begin(async (tx) => {
        const locked = await tx<{ id: string }[]>`
      SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE
    `
        // Deleted while the job was queued — write nothing rather than
        // resurrecting orphaned chunks.
        if (locked.length === 0) return 0

        await tx`DELETE FROM "DocumentChunk" WHERE "documentId" = ${documentId}`

        // Arrays rather than a row per statement: the old loop issued one round
        // trip per chunk, which is 300 round trips for a mid-sized site.
        const BATCH = 200
        for (let i = 0; i < chunks.length; i += BATCH) {
            const batch = chunks.slice(i, i + BATCH)
            const indexes = batch.map((_, j) => i + j)
            const contents = batch.map((c) => c.content)
            const embeddings = batch.map((c) => `[${c.embedding.join(",")}]`)
            const metadatas = batch.map((c) => JSON.stringify(c.metadata ?? {}))

            await tx`
        INSERT INTO "DocumentChunk" ("documentId", "agentId", "chunkIndex", content, embedding, metadata)
        SELECT ${documentId}, ${agentId}, t.idx, t.content, t.emb::vector, t.meta::jsonb
        FROM UNNEST(
          ${indexes}::int[],
          ${contents}::text[],
          ${embeddings}::text[],
          ${metadatas}::text[]
        ) AS t(idx, content, emb, meta)
      `
        }

        await tx`
      UPDATE "Document" SET "chunkCount" = ${chunks.length} WHERE id = ${documentId}
    `
        return chunks.length
    })
}

/**
 * Minimum cosine similarity for a chunk to be worth injecting.
 *
 * Set deliberately low, from measurement rather than intuition. Embedding eight
 * realistic customer questions against a real 58-chunk site crawl with
 * text-embedding-3-small gave:
 *
 *   "can it reply on whatsapp automatically"  best 0.535
 *   "is my data secure"                       best 0.448
 *   "do you work with restaurants"            best 0.425
 *   "how do i contact support"                best 0.384
 *   "do you have a free trial"                best 0.341
 *   "how do i get started"                    best 0.298
 *   "whats the price"                         best 0.240
 *   "how much does it cost"                   best 0.188
 *
 * against off-topic questions scoring 0.134-0.268. Relevant and irrelevant
 * OVERLAP, so no floor separates them cleanly — and a short question compared
 * against a 450-word chunk scores low however relevant it is. A 0.3 floor, which
 * this originally used, would have made the agent answer "I don't know" to
 * "how much does it cost" while still admitting a question about the weather.
 *
 * So the floor only cuts the obviously-unrelated tail. The asymmetry decides it:
 * too high and the agent fails to answer a question it holds the answer to; too
 * low and it gets a few mediocre chunks in a prompt — which is exactly what it
 * did before, with no floor at all, for every agent. Raising this needs new
 * measurement, not a guess.
 */
export const MIN_SIMILARITY = 0.15

/**
 * At most this many chunks from any single document.
 *
 * A crawled site is 100-300 chunks against a typical PDF's four. Without this
 * cap one website wins every slot in the top-k and buries the documents the
 * operator uploaded by hand.
 */
export const MAX_CHUNKS_PER_DOCUMENT = 3

export interface RetrievedChunk {
    content: string
    filename: string
    similarity: number
    sourceType: "file" | "web"
    /** The page this chunk came from, for a crawled site. */
    pageUrl: string | null
}

export async function searchChunks(
    agentId: string,
    queryEmbedding: number[],
    limit = 5
): Promise<RetrievedChunk[]> {
    const embeddingStr = `[${queryEmbedding.join(",")}]`
    // Pull a candidate pool by pure distance (this is the part the vector index
    // serves), then thin it per document and apply the floor. Ranking after the
    // pool keeps the window function off the whole table.
    const poolSize = limit * 10
    return sql<RetrievedChunk[]>`
    WITH candidates AS (
      SELECT
        dc."documentId",
        dc.content,
        dc.metadata,
        d.filename,
        d."sourceType",
        dc.embedding <=> ${embeddingStr}::vector AS dist
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE dc."agentId" = ${agentId}
        AND d.status = 'ready'
      ORDER BY dc.embedding <=> ${embeddingStr}::vector
      LIMIT ${poolSize}
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY "documentId" ORDER BY dist) AS rn
      FROM candidates
    )
    SELECT
      content,
      filename,
      "sourceType",
      metadata->>'url' AS "pageUrl",
      1 - dist AS similarity
    FROM ranked
    WHERE rn <= ${MAX_CHUNKS_PER_DOCUMENT}
      AND 1 - dist >= ${MIN_SIMILARITY}
    ORDER BY dist
    LIMIT ${limit}
  `
}

// ---------------------------------------------------------------------------
// Website documents
// ---------------------------------------------------------------------------

/** Max website links per agent. A crawl is 25 pages, so this is 125 pages. */
export const MAX_WEB_DOCUMENTS_PER_AGENT = 5

/** A crawl older than this with no result is stuck; the watchdog fails it. */
export const CRAWL_STUCK_AFTER_MS = 15 * 60 * 1000

export async function countWebDocuments(agentId: string): Promise<number> {
    const rows = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM "Document"
    WHERE "agentId" = ${agentId} AND "sourceType" = 'web'
  `
    return Number(rows[0]?.n ?? 0)
}

export async function findWebDocumentByUrl(agentId: string, url: string): Promise<Document | null> {
    const rows = await sql<Document[]>`
    SELECT * FROM "Document"
    WHERE "agentId" = ${agentId} AND "sourceType" = 'web' AND "sourceUrl" = ${url}
    LIMIT 1
  `
    return rows[0] ?? null
}

/**
 * Create the row for a website link. `status` starts as 'pending' so retrieval
 * ignores it until the first crawl commits; `r2Key` is empty because there is no
 * object behind a crawled site.
 */
export async function insertWebDocument(doc: {
    agentId: string
    url: string
    title: string
}): Promise<Document> {
    const rows = await sql<Document[]>`
    INSERT INTO "Document"
      ("agentId", filename, "mimeType", "sizeBytes", "r2Key", status, "chunkCount",
       "sourceType", "sourceUrl", "crawlStatus")
    VALUES
      (${doc.agentId}, ${doc.title}, 'text/html', 0, '', 'pending', 0,
       'web', ${doc.url}, 'queued')
    RETURNING *
  `
    return rows[0]!
}

/** Move a crawl along without touching `status`, so old content keeps serving. */
export async function setCrawlStatus(
    id: string,
    crawlStatus: CrawlStatus | null,
    extra?: { meta?: CrawlMeta; error?: string }
): Promise<void> {
    await sql`
    UPDATE "Document"
    SET "crawlStatus" = ${crawlStatus},
        "crawlMeta" = COALESCE(${extra?.meta ? JSON.stringify(extra.meta) : null}::jsonb, "crawlMeta"),
        error = ${extra?.error ?? null}
    WHERE id = ${id}
  `
}

/**
 * The crawl succeeded: publish it. This is the only place a web document becomes
 * visible to retrieval, and it runs after replaceChunks has committed.
 */
export async function finishCrawl(
    id: string,
    fields: { title: string; chunkCount: number; meta: CrawlMeta }
): Promise<void> {
    await sql`
    UPDATE "Document"
    SET status = 'ready',
        "crawlStatus" = NULL,
        error = NULL,
        filename = ${fields.title},
        "chunkCount" = ${fields.chunkCount},
        "crawlMeta" = ${JSON.stringify(fields.meta)}::jsonb,
        "lastCrawledAt" = NOW()
    WHERE id = ${id}
  `
}

/**
 * Fail crawls that never reported back — a worker killed mid-job leaves a row
 * stuck on 'crawling' forever. Runs on the list GET the dashboard already polls,
 * so there is no cron to schedule (and on Dokploy, vercel.json crons do not fire).
 *
 * A document that has served content before keeps its 'ready' status: a failed
 * re-crawl must not take away knowledge the agent already had.
 */
export async function failStuckCrawls(agentId: string): Promise<number> {
    const cutoff = new Date(Date.now() - CRAWL_STUCK_AFTER_MS)
    const rows = await sql<{ id: string }[]>`
    UPDATE "Document"
    SET "crawlStatus" = 'failed',
        error = 'Crawl timed out',
        status = CASE WHEN status = 'ready' THEN 'ready' ELSE 'failed' END
    WHERE "agentId" = ${agentId}
      AND "crawlStatus" IN ('queued', 'crawling', 'embedding')
      AND COALESCE("lastCrawledAt", "createdAt") < ${cutoff}
    RETURNING id
  `
    return rows.length
}
