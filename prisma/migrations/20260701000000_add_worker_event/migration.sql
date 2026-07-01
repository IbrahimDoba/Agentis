-- CreateTable
CREATE TABLE "WorkerEvent" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "agentId" TEXT,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerEvent_category_createdAt_idx" ON "WorkerEvent"("category", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WorkerEvent_agentId_createdAt_idx" ON "WorkerEvent"("agentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WorkerEvent_createdAt_idx" ON "WorkerEvent"("createdAt" DESC);
