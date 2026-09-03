-- The "Test" in MetaTestConnection is a leftover from the App Review harness.
-- These rows are live customer connections carrying real access tokens, and the
-- name misleads anyone reading the schema.
--
-- Postgres renames the table and its indexes/constraints in place; no data
-- moves, so this is safe on a live table.
ALTER TABLE IF EXISTS "MetaTestConnection" RENAME TO "MetaConnection";

ALTER INDEX IF EXISTS "MetaTestConnection_pkey" RENAME TO "MetaConnection_pkey";
ALTER INDEX IF EXISTS "MetaTestConnection_phoneNumberId_key" RENAME TO "MetaConnection_phoneNumberId_key";
ALTER INDEX IF EXISTS "MetaTestConnection_wabaId_idx" RENAME TO "MetaConnection_wabaId_idx";
ALTER INDEX IF EXISTS "MetaTestConnection_userId_idx" RENAME TO "MetaConnection_userId_idx";
