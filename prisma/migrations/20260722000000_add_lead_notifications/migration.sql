-- Lead & handoff email notifications. All additive + nullable, safe to run live.

-- Owner opt-in (default ON) for lead/handoff alerts + daily/weekly digests.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leadNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- When the owner was emailed about a lead (idempotency for the instant poller).
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);

-- When the owner was emailed about a handoff. A newer handoffAt re-arms it.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "handoffNotifiedAt" TIMESTAMP(3);

-- Poller lookup: unnotified, high-intent leads (aiDetected = false) by recency.
CREATE INDEX IF NOT EXISTS "Lead_aiDetected_notifiedAt_createdAt_idx"
  ON "Lead"("aiDetected", "notifiedAt", "createdAt");
