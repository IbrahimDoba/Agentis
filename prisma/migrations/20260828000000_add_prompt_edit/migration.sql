-- History for AI-assisted prompt edits. One row per APPLIED edit; proposals the
-- operator discards are never persisted, so there is no draft state to wedge.
-- beforeValue/afterValue are null for oversized prompts (snapshotTruncated),
-- where `ops` plus the hashes are the rollback fallback.
CREATE TABLE "PromptEdit" (
  "id"                TEXT NOT NULL,
  "agentId"           TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "field"             TEXT NOT NULL,
  "instruction"       TEXT NOT NULL,
  "ops"               JSONB NOT NULL,
  "beforeValue"       TEXT,
  "afterValue"        TEXT,
  "beforeHash"        TEXT NOT NULL,
  "afterHash"         TEXT NOT NULL,
  "snapshotTruncated" BOOLEAN NOT NULL DEFAULT false,
  "model"             TEXT NOT NULL,
  "promptTokens"      INTEGER NOT NULL DEFAULT 0,
  "outputTokens"      INTEGER NOT NULL DEFAULT 0,
  "revertedAt"        TIMESTAMP(3),
  "revertedBy"        TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromptEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptEdit_agentId_createdAt_idx" ON "PromptEdit"("agentId", "createdAt");

ALTER TABLE "PromptEdit" ADD CONSTRAINT "PromptEdit_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
