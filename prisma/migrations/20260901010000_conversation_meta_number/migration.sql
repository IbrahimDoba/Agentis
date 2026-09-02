-- Which Cloud API number a conversation belongs to (channel "meta" only).
-- Additive and nullable: every existing conversation is unaffected.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "metaPhoneNumberId" TEXT;
