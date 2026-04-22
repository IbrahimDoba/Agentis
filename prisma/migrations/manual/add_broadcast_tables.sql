-- Broadcast migration: adds campaign and recipient tables for paced WhatsApp sends
-- Run this against the same Postgres/Neon database used by the app and worker

CREATE TABLE IF NOT EXISTS "BroadcastCampaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "BroadcastCampaign_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "BroadcastCampaign_agentId_idx"
  ON "BroadcastCampaign"("agentId");

CREATE TABLE IF NOT EXISTS "BroadcastRecipient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "broadcastId" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "jid" TEXT NOT NULL,
  "contactName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "sentAt" TIMESTAMPTZ,
  CONSTRAINT "BroadcastRecipient_broadcastId_fkey"
    FOREIGN KEY ("broadcastId") REFERENCES "BroadcastCampaign"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "BroadcastRecipient_broadcastId_idx"
  ON "BroadcastRecipient"("broadcastId");
