-- Auto follow-up: one AI nudge after N minutes of customer silence.
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "autoFollowUpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "autoFollowUpAfterMinutes" INTEGER;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "autoFollowUpInstructions" TEXT;
