-- Track which subscription-expiry notification emails have already been sent
-- per user so the daily scan job doesn't spam the same person every day.
-- Both columns are nullable; the scan only sends + sets them when the user
-- enters the matching window (7 days before / on-or-past expiry).
ALTER TABLE "User"
  ADD COLUMN "expiryWarningEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "expiredEmailSentAt" TIMESTAMP(3);
