-- Explicit switch for the warmup ramp. Previously the only way to send at full
-- rate was to backdate warmupStartedAt, which hid the decision inside a date
-- field. Skipping warmup should be recorded as a choice.
ALTER TABLE "OutreachSettings" ADD COLUMN "warmupEnabled" BOOLEAN NOT NULL DEFAULT true;
