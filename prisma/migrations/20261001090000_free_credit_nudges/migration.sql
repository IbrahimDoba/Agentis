-- Free-plan credit nudges: one email per threshold per billing cycle.
-- Nullable with no default so every existing user starts un-notified; the job
-- treats a stamp older than the current period start as stale, so no reset job
-- is needed and both nudges re-arm on each renewal.
ALTER TABLE "User" ADD COLUMN "creditHalfNotifiedAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN "creditNearCapNotifiedAt" TIMESTAMPTZ;
