-- Broadcast send window: how many hours to spread the whole campaign over so
-- messages go out gradually (like AI follow-ups) instead of all at once.
-- null = default 24h; a minimum of 24h is enforced at the API layer.
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "spreadHours" INTEGER;
