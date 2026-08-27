-- Explicit billing-cycle start anchor. Nullable: existing rows keep NULL and
-- fall back to the legacy rolling-30-day window until their next
-- renewal/reset stamps a real start (fix-forward, no backfill).
ALTER TABLE "User" ADD COLUMN "currentPeriodStart" TIMESTAMP(3);
