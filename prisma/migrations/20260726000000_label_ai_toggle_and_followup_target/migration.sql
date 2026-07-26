-- Per-label AI-off toggle: when true, the AI stays silent on chats with this label.
ALTER TABLE "WhatsAppLabel" ADD COLUMN IF NOT EXISTS "aiDisabled" BOOLEAN NOT NULL DEFAULT false;

-- Label-targeted follow-up campaigns.
ALTER TABLE "FollowUpCampaign" ADD COLUMN IF NOT EXISTS "targetLabelId" TEXT;
ALTER TABLE "FollowUpCampaign" ADD COLUMN IF NOT EXISTS "targetLabelName" TEXT;

-- Bridge for label↔conversation matching across the LID/phone duality: store the
-- raw inbound chat JID on the conversation so batch features (follow-up-by-label)
-- can join to ChatLabel.chatJid. Backfilled as customers message.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "senderJid" TEXT;
CREATE INDEX IF NOT EXISTS "Conversation_agentId_senderJid_idx" ON "Conversation"("agentId", "senderJid");
