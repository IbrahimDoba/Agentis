-- Product album: let the AI send the whole catalogue as one WhatsApp album when
-- a customer asks to see products. Off by default; title is the optional intro.
ALTER TABLE "Agent" ADD COLUMN "productAlbumEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Agent" ADD COLUMN "productAlbumTitle" TEXT;
