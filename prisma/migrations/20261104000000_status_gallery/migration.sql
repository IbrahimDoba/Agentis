-- Status -> Gallery: one card per distinct thing an agent has posted, so it can
-- be posted again without re-uploading. New table plus a nullable link on
-- StatusPost; the backfill only reads existing posts. Nothing changes for agents
-- that don't use Status.
-- AlterTable
ALTER TABLE "StatusPost" ADD COLUMN     "galleryItemId" TEXT;

-- CreateTable
CREATE TABLE "StatusGalleryItem" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "backgroundColor" TEXT,
    "mediaItemId" TEXT,
    "aiNote" TEXT,
    "hiddenAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "StatusGalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusGalleryItem_agentId_updatedAt_idx" ON "StatusGalleryItem"("agentId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatusGalleryItem_agentId_contentKey_key" ON "StatusGalleryItem"("agentId", "contentKey");

-- CreateIndex
CREATE INDEX "StatusPost_galleryItemId_idx" ON "StatusPost"("galleryItemId");

-- AddForeignKey
ALTER TABLE "StatusGalleryItem" ADD CONSTRAINT "StatusGalleryItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusPost" ADD CONSTRAINT "StatusPost_galleryItemId_fkey" FOREIGN KEY ("galleryItemId") REFERENCES "StatusGalleryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: a card per distinct past post (latest caption wins; the latest
-- non-empty AI note, as the app does on repost), then link the posts to it. contentKey must match statusContentKey() in
-- src/lib/status-gallery.ts.
WITH keyed AS (
    SELECT p.*,
        CASE WHEN p."kind" = 'text'
            THEN 'text:' || encode(sha256(convert_to(coalesce(p."backgroundColor", '') || E'\n' || p."text", 'UTF8')), 'hex')
            ELSE 'media:' || p."mediaItemId"
        END AS "contentKey"
    FROM "StatusPost" p
    WHERE p."status" <> 'cancelled'
      AND ((p."kind" = 'text' AND p."text" IS NOT NULL) OR (p."kind" <> 'text' AND p."mediaItemId" IS NOT NULL))
), latest AS (
    SELECT
        "agentId",
        "contentKey",
        (array_agg("kind" ORDER BY "createdAt" DESC))[1] AS "kind",
        (array_agg("text" ORDER BY "createdAt" DESC))[1] AS "text",
        (array_agg("backgroundColor" ORDER BY "createdAt" DESC))[1] AS "backgroundColor",
        (array_agg("mediaItemId" ORDER BY "createdAt" DESC))[1] AS "mediaItemId",
        (array_agg("aiNote" ORDER BY "createdAt" DESC) FILTER (WHERE "aiNote" IS NOT NULL))[1] AS "aiNote",
        min("createdAt") AS "firstAt",
        max("createdAt") AS "lastAt"
    FROM keyed
    GROUP BY "agentId", "contentKey"
)
INSERT INTO "StatusGalleryItem" ("id", "agentId", "contentKey", "kind", "text", "backgroundColor", "mediaItemId", "aiNote", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "agentId", "contentKey", "kind", "text", "backgroundColor", "mediaItemId", "aiNote", "firstAt", "lastAt"
FROM latest;

UPDATE "StatusPost" p
SET "galleryItemId" = g."id"
FROM "StatusGalleryItem" g
WHERE g."agentId" = p."agentId"
  AND g."contentKey" = CASE WHEN p."kind" = 'text'
        THEN 'text:' || encode(sha256(convert_to(coalesce(p."backgroundColor", '') || E'\n' || coalesce(p."text", ''), 'UTF8')), 'hex')
        ELSE 'media:' || coalesce(p."mediaItemId", '')
    END;
