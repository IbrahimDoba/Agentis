-- Per-label AI-off toggle: when true, the AI stays silent on chats with this label.
ALTER TABLE "WhatsAppLabel" ADD COLUMN IF NOT EXISTS "aiDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Label-targeted follow-up campaigns.
ALTER TABLE "FollowUpCampaign" ADD COLUMN IF NOT EXISTS "targetLabelId" TEXT;
ALTER TABLE "FollowUpCampaign" ADD COLUMN IF NOT EXISTS "targetLabelName" TEXT;
