-- One-cycle credit carryover: unused plan allowance kept across a plan change.
ALTER TABLE "User" ADD COLUMN "carryoverCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "carryoverExpiresAt" TIMESTAMP(3);
