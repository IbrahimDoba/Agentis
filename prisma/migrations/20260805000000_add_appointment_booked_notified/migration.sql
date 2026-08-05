-- Instant "appointment booked" email. Additive + nullable, safe to run live.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "bookedNotifiedAt" TIMESTAMP(3);

-- Instant "booked" scan: newly-created, not-yet-notified appointments.
CREATE INDEX IF NOT EXISTS "Appointment_bookedNotifiedAt_createdAt_idx"
  ON "Appointment"("bookedNotifiedAt", "createdAt");
