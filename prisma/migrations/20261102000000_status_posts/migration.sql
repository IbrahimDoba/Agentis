-- Status -> Posts: one row per status post (now or scheduled). New table only;
-- nothing changes for existing agents.
-- CreateTable
CREATE TABLE "StatusPost" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "backgroundColor" TEXT,
    "font" INTEGER,
    "mediaItemId" TEXT,
    "aiNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMPTZ NOT NULL,
    "postedAt" TIMESTAMPTZ,
    "waMessageId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "StatusPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusPost_agentId_scheduledAt_idx" ON "StatusPost"("agentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "StatusPost_agentId_waMessageId_idx" ON "StatusPost"("agentId", "waMessageId");

-- CreateIndex
CREATE INDEX "StatusPost_status_scheduledAt_idx" ON "StatusPost"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "StatusPost" ADD CONSTRAINT "StatusPost_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

