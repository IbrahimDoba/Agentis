-- Add per-agent toggle for the auto-pause-on-human-reply feature.
-- Default true preserves existing behaviour for all current agents.
ALTER TABLE "Agent"
  ADD COLUMN "autoPauseOnHumanReply" BOOLEAN NOT NULL DEFAULT true;
