-- A customer can reach the same agent on both a Baileys number and a Cloud API
-- number. Those are different conversations, so uniqueness must include the
-- channel — otherwise the second silently attaches to the first and replies go
-- out over the wrong transport.
--
-- Plain (non-CONCURRENT) index build: `prisma migrate deploy` wraps a migration
-- in a transaction, and CREATE INDEX CONCURRENTLY cannot run inside one. The
-- table is ~114k rows / 56 MB, so the exclusive lock is momentary.
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_agentId_phoneNumber_key";
DROP INDEX IF EXISTS "Conversation_agentId_phoneNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_agentId_phoneNumber_channel_key"
  ON "Conversation" ("agentId", "phoneNumber", "channel");
