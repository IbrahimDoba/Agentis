import { describe, it, expect, afterAll } from "vitest"
import { sql } from "../client.js"
import {
    insertWebDocument,
    insertDocument,
    replaceChunks,
    searchChunks,
    deleteDocument,
    finishCrawl,
    setCrawlStatus,
    failStuckCrawls,
    findWebDocumentByUrl,
    countWebDocuments,
    MIN_SIMILARITY,
    MAX_CHUNKS_PER_DOCUMENT,
} from "./documents.js"

// Real database, no mocks. Fixtures are namespaced by a unique run id so a
// parallel run cannot collide, and everything is removed in afterAll.
//
// Skipped when there is no database reachable, so `npm test` stays hermetic and
// passes with no tunnel open. It is a skip, never a silent pass: the suite
// reports the file as skipped rather than green.
//
// To actually run these:
//   INTEGRATION_DATABASE_URL=<staging url> npx vitest run src/db/queries

const reachable = await sql`SELECT 1`.then(() => true).catch(() => false)
const suite = reachable ? describe : describe.skip
if (!reachable) console.warn("No database reachable — skipping document integration tests")

const RUN = `itest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const AGENT = `${RUN}-agent`
const OTHER_AGENT = `${RUN}-other-agent`

/** A unit vector pointing along one axis. Cosine similarity is then exact. */
function axisVector(axis: number, weight = 1): number[] {
    const v = new Array(1536).fill(0)
    v[axis] = weight
    return v
}

const RELEVANT = axisVector(0)
const UNRELATED = axisVector(7)

function chunk(content: string, embedding: number[], metadata?: Record<string, unknown>) {
    return { content, embedding, metadata }
}

afterAll(async () => {
    if (reachable) {
        await sql`DELETE FROM "Document" WHERE "agentId" IN (${AGENT}, ${OTHER_AGENT})`
    }
    await sql.end({ timeout: 5 })
})

suite("replaceChunks", () => {
    it("replaces a document's chunks rather than appending them", async () => {
        const doc = await insertWebDocument({ agentId: AGENT, url: `https://${RUN}-replace.test/`, title: "r" })

        await replaceChunks(doc.id, AGENT, [chunk("first version", RELEVANT)])
        await replaceChunks(doc.id, AGENT, [
            chunk("second version a", RELEVANT),
            chunk("second version b", RELEVANT),
        ])

        const rows = await sql<{ content: string }[]>`
      SELECT content FROM "DocumentChunk" WHERE "documentId" = ${doc.id} ORDER BY "chunkIndex"
    `
        expect(rows.map((r) => r.content)).toEqual(["second version a", "second version b"])
    })

    it("is idempotent — running the same crawl twice does not duplicate", async () => {
        const doc = await insertWebDocument({ agentId: AGENT, url: `https://${RUN}-idem.test/`, title: "i" })
        const chunks = [chunk("a", RELEVANT), chunk("b", RELEVANT), chunk("c", RELEVANT)]

        await replaceChunks(doc.id, AGENT, chunks)
        const first = await sql<{ n: string }[]>`SELECT COUNT(*)::text n FROM "DocumentChunk" WHERE "documentId" = ${doc.id}`
        await replaceChunks(doc.id, AGENT, chunks)
        const second = await sql<{ n: string }[]>`SELECT COUNT(*)::text n FROM "DocumentChunk" WHERE "documentId" = ${doc.id}`

        expect(first[0]!.n).toBe("3")
        expect(second[0]!.n).toBe("3")
    })

    it("leaves other documents on the same agent untouched", async () => {
        const keep = await insertDocument({
            agentId: AGENT, filename: "keep.pdf", mimeType: "application/pdf",
            sizeBytes: 10, r2Key: `${RUN}/keep.pdf`,
        })
        const web = await insertWebDocument({ agentId: AGENT, url: `https://${RUN}-untouched.test/`, title: "u" })

        await replaceChunks(keep.id, AGENT, [chunk("from the pdf", RELEVANT)])
        await replaceChunks(web.id, AGENT, [chunk("from the site", RELEVANT)])
        await replaceChunks(web.id, AGENT, [chunk("from the site, again", RELEVANT)])

        const kept = await sql<{ content: string }[]>`
      SELECT content FROM "DocumentChunk" WHERE "documentId" = ${keep.id}
    `
        expect(kept.map((r) => r.content)).toEqual(["from the pdf"])
    })

    it("writes nothing when the document was deleted while the job was queued", async () => {
        const doc = await insertWebDocument({ agentId: AGENT, url: `https://${RUN}-gone.test/`, title: "g" })
        await sql`DELETE FROM "Document" WHERE id = ${doc.id}`

        const written = await replaceChunks(doc.id, AGENT, [chunk("orphan", RELEVANT)])
        expect(written).toBe(0)

        const rows = await sql<{ n: string }[]>`SELECT COUNT(*)::text n FROM "DocumentChunk" WHERE "documentId" = ${doc.id}`
        expect(rows[0]!.n).toBe("0")
    })

    it("stores per-page metadata for attribution", async () => {
        const doc = await insertWebDocument({ agentId: AGENT, url: `https://${RUN}-meta.test/`, title: "m" })
        await replaceChunks(doc.id, AGENT, [
            chunk("delivery info", RELEVANT, { url: "https://site.test/delivery", title: "Delivery" }),
        ])
        const rows = await sql<{ metadata: { url: string } }[]>`
      SELECT metadata FROM "DocumentChunk" WHERE "documentId" = ${doc.id}
    `
        expect(rows[0]!.metadata.url).toBe("https://site.test/delivery")
    })
})

suite("searchChunks", () => {
    it("drops chunks below the similarity floor", async () => {
        const agent = `${RUN}-floor`
        const doc = await insertWebDocument({ agentId: agent, url: `https://${RUN}-floor.test/`, title: "f" })
        await replaceChunks(doc.id, agent, [chunk("nothing to do with it", UNRELATED)])
        await finishCrawl(doc.id, { title: "f", chunkCount: 1, meta: {} })

        const hits = await searchChunks(agent, RELEVANT, 5)
        expect(hits).toHaveLength(0)

        await sql`DELETE FROM "Document" WHERE "agentId" = ${agent}`
    })

    it("caps how many chunks one document can take in the top-k", async () => {
        const agent = `${RUN}-cap`
        const site = await insertWebDocument({ agentId: agent, url: `https://${RUN}-cap.test/`, title: "site" })
        const pdf = await insertDocument({
            agentId: agent, filename: "price-list.pdf", mimeType: "application/pdf",
            sizeBytes: 10, r2Key: `${RUN}/price.pdf`,
        })

        // The site has far more chunks than the PDF, all a good match. Without
        // the cap it would take every slot.
        await replaceChunks(
            site.id, agent,
            Array.from({ length: 20 }, (_, i) => chunk(`site chunk ${i}`, RELEVANT))
        )
        await replaceChunks(pdf.id, agent, [chunk("pdf chunk", RELEVANT)])
        await finishCrawl(site.id, { title: "site", chunkCount: 20, meta: {} })
        await sql`UPDATE "Document" SET status = 'ready' WHERE id = ${pdf.id}`

        const hits = await searchChunks(agent, RELEVANT, 5)
        const fromSite = hits.filter((h) => h.sourceType === "web")
        expect(fromSite.length).toBeLessThanOrEqual(MAX_CHUNKS_PER_DOCUMENT)
        // The hand-uploaded PDF still gets through.
        expect(hits.some((h) => h.filename === "price-list.pdf")).toBe(true)

        await sql`DELETE FROM "Document" WHERE "agentId" = ${agent}`
    })

    it("returns the page URL for a web chunk and null for a file", async () => {
        const agent = `${RUN}-attr`
        const site = await insertWebDocument({ agentId: agent, url: `https://${RUN}-attr.test/`, title: "site" })
        await replaceChunks(site.id, agent, [
            chunk("opening hours are nine to five", RELEVANT, { url: "https://site.test/hours" }),
        ])
        await finishCrawl(site.id, { title: "Site", chunkCount: 1, meta: {} })

        const hits = await searchChunks(agent, RELEVANT, 5)
        expect(hits[0]!.sourceType).toBe("web")
        expect(hits[0]!.pageUrl).toBe("https://site.test/hours")
        expect(hits[0]!.similarity).toBeGreaterThan(MIN_SIMILARITY)

        await sql`DELETE FROM "Document" WHERE "agentId" = ${agent}`
    })

    it("ignores documents that are not ready", async () => {
        const agent = `${RUN}-notready`
        const doc = await insertWebDocument({ agentId: agent, url: `https://${RUN}-notready.test/`, title: "n" })
        // insertWebDocument leaves status 'pending' until the first crawl commits.
        await replaceChunks(doc.id, agent, [chunk("not yet visible", RELEVANT)])

        expect(await searchChunks(agent, RELEVANT, 5)).toHaveLength(0)

        await sql`DELETE FROM "Document" WHERE "agentId" = ${agent}`
    })
})

suite("deleteDocument", () => {
    it("refuses to delete a document belonging to another agent", async () => {
        const mine = await insertWebDocument({ agentId: OTHER_AGENT, url: `https://${RUN}-theirs.test/`, title: "t" })

        // The cross-tenant hole: this used to succeed on the id alone.
        const result = await deleteDocument(mine.id, AGENT)
        expect(result).toBeNull()

        const still = await sql<{ n: string }[]>`SELECT COUNT(*)::text n FROM "Document" WHERE id = ${mine.id}`
        expect(still[0]!.n).toBe("1")
    })

    it("deletes the document and cascades its chunks when the agent matches", async () => {
        const doc = await insertWebDocument({ agentId: AGENT, url: `https://${RUN}-del.test/`, title: "d" })
        await replaceChunks(doc.id, AGENT, [chunk("goes away", RELEVANT)])

        expect(await deleteDocument(doc.id, AGENT)).not.toBeNull()

        const chunks = await sql<{ n: string }[]>`SELECT COUNT(*)::text n FROM "DocumentChunk" WHERE "documentId" = ${doc.id}`
        expect(chunks[0]!.n).toBe("0")
    })
})

suite("crawl lifecycle", () => {
    it("keeps the old content serving while a re-crawl runs", async () => {
        const agent = `${RUN}-serving`
        const doc = await insertWebDocument({ agentId: agent, url: `https://${RUN}-serving.test/`, title: "s" })
        await replaceChunks(doc.id, agent, [chunk("original content", RELEVANT)])
        await finishCrawl(doc.id, { title: "S", chunkCount: 1, meta: {} })

        // A refresh starts. status must not move, or the agent goes blank.
        await setCrawlStatus(doc.id, "crawling")
        const hits = await searchChunks(agent, RELEVANT, 5)
        expect(hits[0]!.content).toBe("original content")

        // And a failed refresh still leaves it serving.
        await setCrawlStatus(doc.id, "failed", { error: "site down" })
        const after = await searchChunks(agent, RELEVANT, 5)
        expect(after[0]!.content).toBe("original content")

        await sql`DELETE FROM "Document" WHERE "agentId" = ${agent}`
    })

    it("fails a stuck crawl but does not un-ready a document that has content", async () => {
        const agent = `${RUN}-stuck`
        const served = await insertWebDocument({ agentId: agent, url: `https://${RUN}-stuck-a.test/`, title: "a" })
        const fresh = await insertWebDocument({ agentId: agent, url: `https://${RUN}-stuck-b.test/`, title: "b" })
        await finishCrawl(served.id, { title: "A", chunkCount: 1, meta: {} })
        await setCrawlStatus(served.id, "crawling")

        // Backdate both past the watchdog cutoff.
        await sql`
      UPDATE "Document"
      SET "createdAt" = NOW() - INTERVAL '1 hour', "lastCrawledAt" = NOW() - INTERVAL '1 hour'
      WHERE "agentId" = ${agent}
    `

        expect(await failStuckCrawls(agent)).toBe(2)

        const rows = await sql<{ id: string; status: string; crawlStatus: string }[]>`
      SELECT id, status, "crawlStatus" FROM "Document" WHERE "agentId" = ${agent}
    `
        const servedRow = rows.find((r) => r.id === served.id)!
        const freshRow = rows.find((r) => r.id === fresh.id)!
        expect(servedRow.crawlStatus).toBe("failed")
        // It has content from an earlier crawl, so it keeps serving.
        expect(servedRow.status).toBe("ready")
        // This one never succeeded, so it is simply failed.
        expect(freshRow.status).toBe("failed")

        await sql`DELETE FROM "Document" WHERE "agentId" = ${agent}`
    })

    it("finds an existing link by URL so re-adding refreshes instead of duplicating", async () => {
        const url = `https://${RUN}-dupe.test/`
        const doc = await insertWebDocument({ agentId: AGENT, url, title: "d" })
        const found = await findWebDocumentByUrl(AGENT, url)
        expect(found?.id).toBe(doc.id)
        // Scoped to the agent, like everything else.
        expect(await findWebDocumentByUrl(OTHER_AGENT, url)).toBeNull()
    })

    it("counts only web documents against the per-agent limit", async () => {
        const agent = `${RUN}-count`
        await insertDocument({
            agentId: agent, filename: "a.pdf", mimeType: "application/pdf",
            sizeBytes: 1, r2Key: `${RUN}/a.pdf`,
        })
        await insertWebDocument({ agentId: agent, url: `https://${RUN}-count.test/`, title: "c" })

        expect(await countWebDocuments(agent)).toBe(1)

        await sql`DELETE FROM "Document" WHERE "agentId" = ${agent}`
    })
})
