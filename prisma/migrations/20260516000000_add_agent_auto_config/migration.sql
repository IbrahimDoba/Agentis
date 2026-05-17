-- Auto-configure flow: pulls profile + recent 1:1 chats from WhatsApp on
-- first connect and drafts an agent config via OpenAI. Adds:
--   - isVerified: from creds.me.verifiedName (only set on verified business accts)
--   - autoConfigStatus: state machine for the draft pipeline
--     (pending | analyzing | ready_for_review | activated | failed)
--   - autoConfigInputs: candidate chats extracted by chat-extractor.ts (Batch A2)
--   - autoConfigDraft:  AI-generated config awaiting user review (Batch A3)
-- Note: existing "businessDescription" column is reused for the description
-- field, so no new "description" column needed here.
ALTER TABLE "Agent"
  ADD COLUMN "isVerified"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoConfigStatus"      TEXT,
  ADD COLUMN "autoConfigInputs"      JSONB,
  ADD COLUMN "autoConfigDraft"       JSONB,
  ADD COLUMN "autoConfigStartedAt"   TIMESTAMP(3),
  ADD COLUMN "autoConfigCompletedAt" TIMESTAMP(3);
