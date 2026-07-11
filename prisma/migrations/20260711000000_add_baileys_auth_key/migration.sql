-- Baileys signal auth state, one row per key — replaces the per-file volume
-- store so the auth footprint can never exhaust the disk's inodes (root cause
-- of the duplicate-delivery incident). Written by the worker via raw SQL.
CREATE TABLE IF NOT EXISTS "BaileysAuthKey" (
    "agentId"   TEXT NOT NULL,
    "category"  TEXT NOT NULL,
    "keyId"     TEXT NOT NULL,
    "value"     BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BaileysAuthKey_pkey" PRIMARY KEY ("agentId", "category", "keyId")
);

CREATE INDEX IF NOT EXISTS "BaileysAuthKey_agentId_idx" ON "BaileysAuthKey"("agentId");

-- Cascade-delete an agent's keys when the agent is removed (mirrors BaileysSession).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'BaileysAuthKey_agentId_fkey'
  ) THEN
    ALTER TABLE "BaileysAuthKey"
      ADD CONSTRAINT "BaileysAuthKey_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
