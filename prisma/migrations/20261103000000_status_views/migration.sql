-- Status -> Analytics: per-person delivered/viewed/liked/replied for each status
-- post. New table only; nothing changes for existing agents.
-- CreateTable
CREATE TABLE "StatusView" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "deliveredAt" TIMESTAMPTZ,
    "viewedAt" TIMESTAMPTZ,
    "likedAt" TIMESTAMPTZ,
    "repliedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "StatusView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusView_agentId_idx" ON "StatusView"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusView_postId_phone_key" ON "StatusView"("postId", "phone");

-- AddForeignKey
ALTER TABLE "StatusView" ADD CONSTRAINT "StatusView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "StatusPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

