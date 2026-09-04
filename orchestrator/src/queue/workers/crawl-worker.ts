import { Worker } from "bullmq"
import { getRedis } from "../redis.js"
import {
    getDocument,
    setCrawlStatus,
    finishCrawl,
    type CrawlMeta,
} from "../../db/queries/documents.js"
import { crawlSite } from "../../crawl/crawler.js"
import { chunkStructuredText } from "../../rag/chunker.js"
import { indexChunks } from "../../rag/indexer.js"
import { logger as rootLogger } from "../../lib/logger.js"

const logger = rootLogger.child({ module: "crawl-worker" })

/**
 * The job carries an id and nothing else.
 *
 * Page content never goes through Redis. The embed path next door serialises a
 * whole file as `Array.from(buffer)` — a 10 MB PDF becomes a ten-million-element
 * JSON array — and a 25-page crawl would be worse. The worker re-reads the URL
 * from the row it is about to update.
 */
export interface CrawlJobData {
    documentId: string
}

/** Human-readable reasons, so the dashboard is not showing an enum. */
const FAILURE_MESSAGES: Record<string, string> = {
    invalid_url: "That does not look like a valid website address.",
    robots_disallowed: "This site's robots.txt asks crawlers not to read it.",
    site_unreachable: "The site stopped responding partway through.",
    no_pages_extracted: "No readable text was found at that address.",
    javascript_rendered:
        "This site builds its pages with JavaScript, so there is no text for us to read. Try a specific page that loads content directly.",
}

export function startCrawlWorker() {
    const worker = new Worker<CrawlJobData>(
        "orchestrator-crawl",
        async (job) => {
            const { documentId } = job.data

            const doc = await getDocument(documentId)
            if (!doc) {
                logger.warn({ documentId }, "Document not found — skipping crawl job")
                return
            }
            if (!doc.sourceUrl) {
                await setCrawlStatus(documentId, "failed", { error: "No URL on this document" })
                return
            }

            logger.info({ documentId, url: doc.sourceUrl }, "Starting crawl")

            try {
                await setCrawlStatus(documentId, "crawling")

                const result = await crawlSite(doc.sourceUrl)

                const meta: CrawlMeta = {
                    pagesCrawled: result.pagesCrawled,
                    pagesFailed: result.pagesFailed,
                    pagesSkipped: result.pagesSkipped,
                    deadlineHit: result.deadlineHit,
                    unreachable: result.unreachable,
                    jsRendered: result.jsRendered,
                    failure: result.failure,
                }

                if (result.pages.length === 0) {
                    const message =
                        FAILURE_MESSAGES[result.failure ?? ""] ?? "We could not read that website."
                    // Note this leaves `status` alone. If the link had content
                    // from an earlier crawl the agent keeps answering from it —
                    // a failed refresh must not take away working knowledge.
                    await setCrawlStatus(documentId, "failed", { meta, error: message })
                    logger.warn({ documentId, failure: result.failure }, "Crawl produced no pages")
                    return
                }

                await setCrawlStatus(documentId, "embedding", { meta })

                // Chunk per page so a chunk never straddles two pages, and carry
                // the page URL on every chunk for retrieval attribution.
                const contents: string[] = []
                const metadata: Record<string, unknown>[] = []
                for (const page of result.pages) {
                    for (const chunk of chunkStructuredText(page.blocks, page.title)) {
                        contents.push(chunk)
                        metadata.push({ url: page.url, title: page.title })
                    }
                }

                if (contents.length === 0) {
                    await setCrawlStatus(documentId, "failed", {
                        meta,
                        error: "No readable text was found at that address.",
                    })
                    return
                }

                // Embeds, then swaps old chunks for new in one transaction.
                await indexChunks(documentId, doc.agentId, contents, metadata)

                // Only now does the link become visible to retrieval.
                await finishCrawl(documentId, {
                    title: titleFor(doc.sourceUrl, result.pages[0]?.title),
                    chunkCount: contents.length,
                    meta: { ...meta, pagesCrawled: result.pages.length },
                })

                logger.info(
                    { documentId, pages: result.pages.length, chunks: contents.length },
                    "Crawl complete"
                )
            } catch (err: any) {
                logger.error({ documentId, err: err.message }, "Crawl job failed")
                await setCrawlStatus(documentId, "failed", {
                    error: "Something went wrong reading that website. Try again.",
                })
                throw err // rethrow so BullMQ retries
            }
        },
        {
            connection: getRedis(),
            // A crawl holds an outbound connection for up to two minutes, so
            // this stays well below the embed worker's five.
            concurrency: 2,
        }
    )

    worker.on("failed", (job, err) => {
        logger.error({ jobId: job?.id, err: err.message }, "Crawl worker job failed permanently")
    })

    logger.info("Crawl worker started")
    return worker
}

/** Prefer the home page's own title; fall back to the hostname. */
function titleFor(url: string, pageTitle?: string): string {
    const t = (pageTitle ?? "").trim()
    if (t) return t.slice(0, 200)
    try {
        return new URL(url).hostname.replace(/^www\./, "")
    } catch {
        return url.slice(0, 200)
    }
}
