-- Opt-in "only reply to chats with selected labels" mode. Defaults keep every
-- existing agent on "all" and every label out of the allowlist, so nothing
-- changes until an owner switches it on in agent Settings.
ALTER TABLE "Agent" ADD COLUMN "labelReplyPolicy" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "WhatsAppLabel" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
