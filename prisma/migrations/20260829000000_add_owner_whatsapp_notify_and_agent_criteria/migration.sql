-- Feature 2: owner WhatsApp lead/handoff alerts (account-level, independent of email).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifyWhatsappNumber" TEXT;

-- Feature 3: per-agent free-text lead/handoff detection criteria (nullable = use defaults).
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "leadCriteria" TEXT;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "handoffCriteria" TEXT;
