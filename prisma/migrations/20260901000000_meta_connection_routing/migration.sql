-- Multi-number routing: a connected number needs an owner and an agent, and
-- each message needs to record which of our numbers it belongs to. All
-- nullable — the pre-existing env-configured number has no connection row and
-- must keep working unchanged.
ALTER TABLE "MetaTestConnection" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "MetaTestConnection" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "MetaTestMessage" ADD COLUMN IF NOT EXISTS "phoneNumberId" TEXT;

CREATE INDEX IF NOT EXISTS "MetaTestConnection_userId_idx" ON "MetaTestConnection"("userId");
CREATE INDEX IF NOT EXISTS "MetaTestMessage_phoneNumberId_createdAt_idx" ON "MetaTestMessage"("phoneNumberId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "MetaTestConnection" ADD CONSTRAINT "MetaTestConnection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MetaTestConnection" ADD CONSTRAINT "MetaTestConnection_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
