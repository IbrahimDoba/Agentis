-- Isolated message log for the Meta Cloud API test harness (branch:
-- meta-integration). Deliberately separate from Conversation/Message so the
-- official-API demo never bleeds into real dashboard data.
CREATE TABLE IF NOT EXISTS "MetaTestMessage" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "waMessageId" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaTestMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MetaTestMessage_waId_createdAt_idx" ON "MetaTestMessage"("waId", "createdAt");
CREATE INDEX IF NOT EXISTS "MetaTestMessage_createdAt_idx" ON "MetaTestMessage"("createdAt" DESC);
