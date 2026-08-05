-- AI + human appointment scheduling with reminders. All additive; safe to run live.

-- Account-wide default reminder lead times (minutes before the appointment).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appointmentReminder1Minutes" INTEGER NOT NULL DEFAULT 60;
-- Nullable: an account can default new appointments to a single reminder.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appointmentReminder2Minutes" INTEGER DEFAULT 15;

-- Per-agent gate for the AI schedule_appointment tool (manual creation is ungated).
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "appointmentSchedulingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Appointment status enum.
DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Appointments table.
CREATE TABLE IF NOT EXISTS "Appointment" (
  "id"               TEXT NOT NULL,
  "agentId"          TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "conversationId"   TEXT,
  "customerName"     TEXT,
  "customerNumber"   TEXT,
  "title"            TEXT NOT NULL,
  "notes"            TEXT,
  "scheduledAt"      TIMESTAMPTZ NOT NULL,
  "status"           "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdBy"        TEXT NOT NULL DEFAULT 'ai',
  "reminder1Minutes" INTEGER NOT NULL DEFAULT 60,
  "reminder1SentAt"  TIMESTAMP(3),
  "reminder2Minutes" INTEGER DEFAULT 15,
  "reminder2SentAt"  TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Appointment_userId_scheduledAt_idx"
  ON "Appointment"("userId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Appointment_status_scheduledAt_idx"
  ON "Appointment"("status", "scheduledAt");

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
