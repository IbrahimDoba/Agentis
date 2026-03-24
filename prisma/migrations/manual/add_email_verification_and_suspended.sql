-- Add email verification fields to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationCodeExpiry" TIMESTAMP(3);

-- Add SUSPENDED value to UserStatus enum
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
