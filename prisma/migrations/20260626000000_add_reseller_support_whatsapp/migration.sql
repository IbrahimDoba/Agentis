-- Per-tenant support WhatsApp number. Users get a "Contact support" link
-- (wa.me) to this number; a reseller admin sets her own, the platform admin
-- sets Dailzero's. Additive + nullable.
ALTER TABLE "Reseller" ADD COLUMN "supportWhatsapp" TEXT;
