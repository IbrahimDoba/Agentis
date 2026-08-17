-- Gates the Meta tab to accounts provisioned on the official WhatsApp Cloud
-- API. Defaults off: Baileys-channel users have no WABA to display.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "metaEnabled" BOOLEAN NOT NULL DEFAULT false;
