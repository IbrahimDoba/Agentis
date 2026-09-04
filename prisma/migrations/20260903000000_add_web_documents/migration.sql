-- Website links in the knowledge base.
--
-- A crawled site is ONE Document row, so the Documents tab shows one row per
-- link rather than 25 per page, and replacing a link's content is a single
-- transaction. Per-page attribution lives on DocumentChunk.metadata.
--
-- Purely additive: five nullable/defaulted columns and two indexes. No data is
-- read, rewritten or removed, and every existing row keeps working unchanged.
ALTER TABLE "Document" ADD COLUMN "sourceType"    TEXT NOT NULL DEFAULT 'file';
ALTER TABLE "Document" ADD COLUMN "sourceUrl"     TEXT;
ALTER TABLE "Document" ADD COLUMN "crawlStatus"   TEXT;
ALTER TABLE "Document" ADD COLUMN "lastCrawledAt" TIMESTAMPTZ;
ALTER TABLE "Document" ADD COLUMN "crawlMeta"     JSONB;

-- Document had no indexes at all. listDocuments filters agentId and orders by
-- createdAt on every dashboard poll, and one crawl adds a row where there was
-- one document before.
CREATE INDEX IF NOT EXISTS "Document_agentId_createdAt_idx"
  ON "Document"("agentId", "createdAt");

-- Powers the stuck-crawl watchdog without scanning the table.
CREATE INDEX IF NOT EXISTS "Document_agentId_crawlStatus_idx"
  ON "Document"("agentId", "crawlStatus");
