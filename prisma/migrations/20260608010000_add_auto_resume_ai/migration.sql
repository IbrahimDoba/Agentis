-- Per-agent auto-resume timer. After this many minutes of inactivity, a
-- human-mode conversation automatically switches back to AI (a worker sweep
-- enforces it). NULL = off. Additive, nullable — nothing changes for existing
-- agents until they opt in.
ALTER TABLE "Agent" ADD COLUMN "autoResumeAiAfterMinutes" INTEGER;
