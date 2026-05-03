-- AlterTable: add lastFollowedUpAt to Conversation
ALTER TABLE "Conversation" ADD COLUMN "lastFollowedUpAt" TIMESTAMP(3);

-- CreateTable: FollowUpCampaign
CREATE TABLE "FollowUpCampaign" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scanning',
    "mode" TEXT NOT NULL DEFAULT 'auto',
    "minDaysSince" INTEGER NOT NULL DEFAULT 1,
    "totalScanned" INTEGER NOT NULL DEFAULT 0,
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalSkipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "FollowUpCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FollowUpMessage
CREATE TABLE "FollowUpMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "contactName" TEXT,
    "aiReason" TEXT,
    "generatedMessage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUpMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpCampaign_agentId_idx" ON "FollowUpCampaign"("agentId");
CREATE INDEX "FollowUpMessage_campaignId_idx" ON "FollowUpMessage"("campaignId");
CREATE INDEX "FollowUpMessage_conversationId_idx" ON "FollowUpMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "FollowUpCampaign" ADD CONSTRAINT "FollowUpCampaign_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpMessage" ADD CONSTRAINT "FollowUpMessage_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "FollowUpCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpMessage" ADD CONSTRAINT "FollowUpMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
