-- Ad-based handoff: customers from ads whose text matches a keyword go straight
-- to a human with a fixed message instead of the AI. Empty array = off.
ALTER TABLE "Agent" ADD COLUMN "adHandoffKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Agent" ADD COLUMN "adHandoffMessage" TEXT;
