-- Reseller / white-label multi-tenancy foundation.
--
-- Additive + backward-compatible: existing users backfill to the root tenant
-- "platform" (which behaves exactly as today), and email uniqueness moves from
-- global to per-tenant so the same address can exist on Dailzero and on a
-- reseller's site. No data is destroyed; no NULLs introduced.
--
-- Order matters: the Reseller table and the "platform" row must exist BEFORE
-- the User.resellerId foreign key is added, otherwise the backfilled rows
-- (all -> 'platform') would fail FK validation.

-- 1. New role for a reseller's own admin (super-admin "ADMIN" still sees all).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'RESELLER_ADMIN';

-- 2. Reseller (the tenant). Root tenant is a fixed row id 'platform'.
CREATE TABLE "Reseller" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "domainAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "appName" TEXT NOT NULL,
  "logoUrl" TEXT,
  "primaryColor" TEXT,
  "supportEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "creditPool" INTEGER NOT NULL DEFAULT 0,
  "creditPoolTotal" INTEGER NOT NULL DEFAULT 0,
  "adminUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Reseller_domain_key" ON "Reseller"("domain");

-- 3. The root tenant (Dailzero). Unmatched hosts fall back to this in code;
--    its domains are recorded here for completeness.
INSERT INTO "Reseller" ("id", "name", "domain", "domainAliases", "appName", "status", "updatedAt")
VALUES (
  'platform',
  'Dailzero',
  'dailzero.com',
  ARRAY['www.dailzero.com', 'app.dailzero.ai']::TEXT[],
  'D-Zero AI',
  'active',
  CURRENT_TIMESTAMP
);

-- 4. A reseller's own custom plans (manual activation; no checkout).
CREATE TABLE "ResellerPlan" (
  "id" TEXT NOT NULL,
  "resellerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceNaira" INTEGER NOT NULL,
  "credits" INTEGER NOT NULL,
  "durationDays" INTEGER NOT NULL DEFAULT 30,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResellerPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResellerPlan_resellerId_idx" ON "ResellerPlan"("resellerId");
ALTER TABLE "ResellerPlan"
  ADD CONSTRAINT "ResellerPlan_resellerId_fkey"
  FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Tenant column on User. DEFAULT 'platform' backfills every existing row.
ALTER TABLE "User" ADD COLUMN "resellerId" TEXT NOT NULL DEFAULT 'platform';

-- 6. FK now validates (platform row exists, all users point at it).
ALTER TABLE "User"
  ADD CONSTRAINT "User_resellerId_fkey"
  FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Email uniqueness: global -> per tenant.
DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_resellerId_email_key" ON "User"("resellerId", "email");
