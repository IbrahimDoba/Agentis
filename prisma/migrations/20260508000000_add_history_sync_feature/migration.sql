-- Per-user admin-controlled toggle for the WhatsApp chat-history-on-link feature.
-- When true, the next BaileysSession this user's agents start will request a
-- full history sync from WhatsApp on first connect.
ALTER TABLE "User"
  ADD COLUMN "historySyncEnabled" BOOLEAN NOT NULL DEFAULT false;

-- One-shot gate so reconnects of an already-synced session don't re-pull
-- history. Set when the messaging-history.set handler finishes.
ALTER TABLE "BaileysSession"
  ADD COLUMN "historySyncedAt" TIMESTAMP(3);
