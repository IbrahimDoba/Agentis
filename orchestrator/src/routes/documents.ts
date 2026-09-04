import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { randomUUID } from "crypto"
import { uploadFile, deleteFile, r2Keys } from "../storage/r2.js"
import {
    insertDocument,
    listDocuments,
    getDocument,
    updateDocumentStatus,
    deleteDocument,
    failStuckCrawls,
    insertWebDocument,
    findWebDocumentByUrl,
    countWebDocuments,
    setCrawlStatus,
    MAX_WEB_DOCUMENTS_PER_AGENT,
} from "../db/queries/documents.js"
import { validateCrawlUrl } from "../lib/ip-guard.js"
import { normalizeUrl } from "../crawl/frontier.js"
import { embedQueue, crawlQueue } from "../queue/queues.js"
import { SUPPORTED_MIME_TYPES } from "../rag/extractor.js"
import { logger as rootLogger } from "../lib/logger.js"

const logger = rootLogger.child({ module: "routes/documents" })

const ListQuerySchema = z.object({ agentId: z.string().min(1) })
const DocIdSchema = z.object({ id: z.string().uuid() })
// Every by-id route takes the agent too. Without it the id alone was the only
// authorisation, so any caller could read or delete another tenant's document.
const AgentScopeSchema = z.object({ agentId: z.string().min(1) })
const WebDocSchema = z.object({
    agentId: z.string().min(1),
    url: z.string().min(1).max(2048),
})

/** Why a URL was rejected, in words an operator can act on. */
const URL_REJECTIONS: Record<string, string> = {
    unparseable_url: "That does not look like a web address.",
    blocked_scheme: "Only http and https addresses can be added.",
    credentials_in_url: "Remove the username and password from the address.",
    blocked_port: "Only standard web ports (80 and 443) are supported.",
    blocked_hostname: "That address is not a public website.",
    hostname_without_dot: "That does not look like a public web address.",
    empty_host: "That does not look like a web address.",
}

function rejectionMessage(reason: string): string {
    // Everything else out of validateCrawlUrl is a private or reserved address.
    return URL_REJECTIONS[reason] ?? "That address points somewhere private and cannot be added."
}

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

        // A worker killed mid-crawl leaves a row stuck on 'crawling' forever.
        // The dashboard polls this route every 3s while anything is in flight,
        // so the watchdog needs no cron (and Dokploy does not run vercel.json's).
        await failStuckCrawls(parsed.data.agentId)

        const docs = await listDocuments(parsed.data.agentId)
        return reply.send({ documents: docs })
    })

    /**
     * GET /v1/documents/:id
     */
    app.get("/documents/:id", async (req, reply) => {
        const parsed = DocIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid document id" })

        const scope = AgentScopeSchema.safeParse(req.query)
        if (!scope.success) return reply.status(400).send({ error: "agentId required" })

        const doc = await getDocument(parsed.data.id)
        if (!doc || doc.agentId !== scope.data.agentId) {
            return reply.status(404).send({ error: "Document not found" })
        }
        return reply.send(doc)
    })

    /**
     * DELETE /v1/documents/:id
     * Deletes from R2 + cascades chunks in DB
     */
    app.delete("/documents/:id", async (req, reply) => {
        const parsed = DocIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid document id" })
        const scope = AgentScopeSchema.safeParse(req.query)
        if (!scope.success) return reply.status(400).send({ error: "agentId required" })

        const deleted = await deleteDocument(parsed.data.id, scope.data.agentId)
        if (!deleted) return reply.status(404).send({ error: "Document not found" })

        // A crawled site has no object behind it, only chunks.
        if (deleted.r2Key) {
            // Delete from R2 (don't block response on this)
            deleteFile(deleted.r2Key).catch((err) =>
                logger.warn({ id: parsed.data.id, err: err.message }, "Failed to delete doc from R2")
            )
        }

        logger.info({ id: parsed.data.id }, "Document deleted")
        return reply.status(204).send()
    })

    /**
     * POST /v1/documents/web
     * Body: { agentId, url }
     *
     * Adds a website link and queues the crawl. Re-posting a URL the agent
     * already has re-crawls it rather than creating a second row, which is what
     * an operator means when they paste the same address twice.
     */
    app.post("/documents/web", async (req, reply) => {
        const parsed = WebDocSchema.safeParse(req.body)
        if (!parsed.success) return reply.status(400).send({ error: "agentId and url are required" })

        const { agentId } = parsed.data

        // Normalise first (adds https://, strips the fragment and tracking
        // params) so "acme.com" and "https://acme.com/#top" are one link.
        const normalized = normalizeUrl(parsed.data.url)
        if (!normalized) return reply.status(400).send({ error: "That does not look like a web address." })

        // The SSRF gate. It runs here as well as inside safeFetch so the
        // operator gets told why, instead of watching a crawl fail silently.
        const check = validateCrawlUrl(normalized)
        if (!check.ok) return reply.status(400).send({ error: rejectionMessage(check.reason) })

        const existing = await findWebDocumentByUrl(agentId, normalized)
        if (existing) {
            await setCrawlStatus(existing.id, "queued", { error: undefined })
            await queueCrawl(existing.id)
            return reply.status(202).send({ id: existing.id, crawlStatus: "queued", refreshed: true })
        }

        if (await countWebDocuments(agentId) >= MAX_WEB_DOCUMENTS_PER_AGENT) {
            return reply.status(400).send({
                error: `You can add up to ${MAX_WEB_DOCUMENTS_PER_AGENT} websites. Remove one first.`,
            })
        }

        const doc = await insertWebDocument({
            agentId,
            url: normalized,
            // A placeholder until the crawl reads the site's own title.
            title: check.url.hostname.replace(/^www\./, ""),
        })
        await queueCrawl(doc.id)

        logger.info({ docId: doc.id, agentId, url: normalized }, "Website crawl queued")
        return reply.status(202).send({ id: doc.id, crawlStatus: "queued", refreshed: false })
    })

    /**
     * POST /v1/documents/:id/reindex?agentId=xxx
     *
     * Rebuild a stored file's chunks from the original in R2, without asking the
     * customer to upload it again. Exists because the chunker changed: documents
     * indexed by the old whitespace-flattening version keep its chunks until
     * something rebuilds them, and re-uploading by hand is not a fix we can ask
     * every customer to perform.
     *
     * The old chunks keep serving until the new ones commit — replaceChunks
     * swaps them inside one transaction.
     */
    app.post("/documents/:id/reindex", async (req, reply) => {
        const parsed = DocIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid document id" })
        const scope = AgentScopeSchema.safeParse(req.query)
        if (!scope.success) return reply.status(400).send({ error: "agentId required" })

        const doc = await getDocument(parsed.data.id)
        if (!doc || doc.agentId !== scope.data.agentId) {
            return reply.status(404).send({ error: "Document not found" })
        }
        // A crawled site has no stored file; recrawl is its equivalent.
        if (doc.sourceType === "web") {
            return reply.status(400).send({ error: "Use recrawl for a website link" })
        }
        if (!doc.r2Key) {
            return reply.status(400).send({ error: "Nothing stored to re-index" })
        }

        await updateDocumentStatus(doc.id, "pending")
        await embedQueue.add("reindex", { documentId: doc.id }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } })

        logger.info({ documentId: doc.id, agentId: doc.agentId }, "Re-index queued")
        return reply.status(202).send({ id: doc.id, status: "pending" })
    })

    /**
     * POST /v1/documents/:id/recrawl?agentId=xxx
     *
     * Re-reads a site. The existing content keeps serving until the new content
     * commits, so this is safe to press at any time.
     */
    app.post("/documents/:id/recrawl", async (req, reply) => {
        const parsed = DocIdSchema.safeParse(req.params)
        if (!parsed.success) return reply.status(400).send({ error: "Invalid document id" })
        const scope = AgentScopeSchema.safeParse(req.query)
        if (!scope.success) return reply.status(400).send({ error: "agentId required" })

        const doc = await getDocument(parsed.data.id)
        if (!doc || doc.agentId !== scope.data.agentId) {
            return reply.status(404).send({ error: "Document not found" })
        }
        if (doc.sourceType !== "web" || !doc.sourceUrl) {
            return reply.status(400).send({ error: "That document is not a website link" })
        }
        if (doc.crawlStatus && doc.crawlStatus !== "failed") {
            return reply.status(409).send({ error: "This site is already being read." })
        }

        await setCrawlStatus(doc.id, "queued", { error: undefined })
        await queueCrawl(doc.id)

        logger.info({ docId: doc.id, url: doc.sourceUrl }, "Website re-crawl queued")
        return reply.status(202).send({ id: doc.id, crawlStatus: "queued" })
    })
}

/**
 * Queue a crawl, replacing any job already sitting under the same id.
 *
 * A fixed jobId gives idempotency (mirroring `embed-{docId}`), but BullMQ keeps
 * completed jobs around and silently drops a re-add with an id it has seen. The
 * remove-then-add is what makes the refresh button work a second time.
 */
async function queueCrawl(documentId: string) {
    const jobId = `crawl-${documentId}`
    await crawlQueue.remove(jobId).catch(() => { })
    await crawlQueue.add("crawl-site", { documentId }, { jobId })
}
