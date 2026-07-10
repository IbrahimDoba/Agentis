-- Soft delete for conversations: hides from the tab and acts as the AI memory
-- cutoff (orchestrator only reads messages created after this). Additive +
-- nullable; the unique constraint on (agentId, phoneNumber) is intentionally
-- left untouched (conversations are reused, not recreated).
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Partial index so the tab's "not deleted" list stays cheap as rows grow.
CREATE INDEX IF NOT EXISTS "Conversation_agentId_deletedAt_idx"
  ON "Conversation"("agentId") WHERE "deletedAt" IS NULL;
