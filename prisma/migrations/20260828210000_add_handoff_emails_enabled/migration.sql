-- Handoff-request email alerts, split out from leadNotificationsEnabled so an
-- owner can toggle handoff emails independently of lead alerts / digests.
-- Backfill existing rows to their current lead-notifications setting so nobody
-- who had opted out suddenly starts receiving handoff emails.
ALTER TABLE "User" ADD COLUMN "handoffEmailsEnabled" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" SET "handoffEmailsEnabled" = "leadNotificationsEnabled";
