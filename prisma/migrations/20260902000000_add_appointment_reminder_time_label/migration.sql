-- Optional exact time text for an appointment's WhatsApp reminder. Nullable:
-- existing appointments keep NULL (reminder states the day, no clock time).
ALTER TABLE "Appointment" ADD COLUMN "reminderTimeLabel" TEXT;
