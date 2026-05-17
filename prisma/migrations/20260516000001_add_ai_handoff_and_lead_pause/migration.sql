-- AI-driven auto-pause: the AI calls two new tools mid-conversation when it
-- detects (a) it can't help further (request_human_handoff) or (b) the
-- customer is a qualified lead (mark_qualified_lead). Both tools record
-- the reason on the Conversation row + can pause the AI via Agent toggles.
ALTER TABLE "Conversation"
  ADD COLUMN "handoffReason"    TEXT,
  ADD COLUMN "handoffAt"        TIMESTAMP(3),
  ADD COLUMN "handoffUrgency"   TEXT,
  ADD COLUMN "leadQualifiedAt"  TIMESTAMP(3),
  ADD COLUMN "leadIntent"       TEXT;

ALTER TABLE "Agent"
  ADD COLUMN "pauseOnAiHandoff"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pauseOnQualifiedLead" BOOLEAN NOT NULL DEFAULT true;
