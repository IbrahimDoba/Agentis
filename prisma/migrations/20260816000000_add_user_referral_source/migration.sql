-- Optional "how did you hear about us?" answer captured at signup, for
-- attribution/analytics. Nullable — existing users keep NULL.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralSource" TEXT;
