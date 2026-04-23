CREATE TABLE IF NOT EXISTS "CreditUsage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agentId" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageType" TEXT NOT NULL CHECK ("messageType" IN ('text', 'image')),
  "source" TEXT NOT NULL DEFAULT 'ai',
  "creditsUsed" INTEGER NOT NULL CHECK ("creditsUsed" >= 0),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "CreditUsage_agentId_createdAt_idx"
  ON "CreditUsage" ("agentId", "createdAt");

CREATE INDEX IF NOT EXISTS "CreditUsage_conversationId_idx"
  ON "CreditUsage" ("conversationId");
