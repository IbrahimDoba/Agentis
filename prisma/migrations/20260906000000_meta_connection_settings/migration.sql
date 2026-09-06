-- Per-number settings for a connected Cloud API number.
--
-- Both are additive columns with defaults, so this is safe to run against a
-- live table: Postgres stores the default in the catalog rather than rewriting
-- every row, and no index is touched.
--
-- Deploy order matters: the orchestrator reads "aiRepliesEnabled" on every
-- inbound Cloud API message, so this migration must land BEFORE the
-- orchestrator that queries it.
ALTER TABLE "MetaConnection"
  ADD COLUMN IF NOT EXISTS "aiRepliesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typingIndicator" BOOLEAN NOT NULL DEFAULT false;
