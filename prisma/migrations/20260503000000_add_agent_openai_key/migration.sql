-- AlterTable: add openaiApiKey to Agent (nullable, was missing from initial schema)
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "openaiApiKey" TEXT;
