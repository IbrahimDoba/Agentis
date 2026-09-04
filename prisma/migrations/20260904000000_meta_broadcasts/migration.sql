-- Broadcasts over the Cloud API must send an approved template: free-form text
-- outside the 24-hour service window is rejected by Meta. All nullable and
-- defaulted, so existing Baileys campaigns are untouched.
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "metaPhoneNumberId" TEXT;
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "templateName" TEXT;
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "templateLanguage" TEXT;
