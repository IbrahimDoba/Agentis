-- WhatsApp chat labels (AI tagging). Adds the per-agent toggle, a synced-label
-- mirror, and chat↔label associations.

-- AlterTable: Agent
ALTER TABLE "Agent" ADD COLUMN "chatTaggingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: WhatsAppLabel
CREATE TABLE "WhatsAppLabel" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "waLabelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" INTEGER NOT NULL DEFAULT 0,
  "predefinedId" TEXT,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "isStage" BOOLEAN NOT NULL DEFAULT false,
  "stageOrder" INTEGER,
  "applyRule" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppLabel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppLabel_agentId_waLabelId_key" ON "WhatsAppLabel"("agentId", "waLabelId");
ALTER TABLE "WhatsAppLabel"
  ADD CONSTRAINT "WhatsAppLabel_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ChatLabel
CREATE TABLE "ChatLabel" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "chatJid" TEXT NOT NULL,
  "phoneNumber" TEXT,
  "waLabelId" TEXT NOT NULL,
  "appliedBy" TEXT NOT NULL DEFAULT 'whatsapp',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatLabel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatLabel_agentId_chatJid_waLabelId_key" ON "ChatLabel"("agentId", "chatJid", "waLabelId");
CREATE INDEX "ChatLabel_agentId_phoneNumber_idx" ON "ChatLabel"("agentId", "phoneNumber");
CREATE INDEX "ChatLabel_agentId_waLabelId_idx" ON "ChatLabel"("agentId", "waLabelId");
ALTER TABLE "ChatLabel"
  ADD CONSTRAINT "ChatLabel_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
