-- Optional image for a broadcast: a fetchable URL. When set (Baileys channel),
-- each recipient gets the image with `message` as its caption. null = text-only.
ALTER TABLE "BroadcastCampaign" ADD COLUMN "imageUrl" TEXT;
