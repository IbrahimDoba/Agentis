-- Performance indexes for the dashboard read paths (Phase 1 of the DB-load
-- reduction work). All additive; safe to apply online on tables this size.

-- Message had NO index on conversationId (only the PK) — every conversation
-- message read was a filtered scan. This is the highest-impact index.
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- Conversation list query filters by agentId and orders by lastActivityAt desc.
CREATE INDEX "Conversation_agentId_lastActivityAt_idx" ON "Conversation"("agentId", "lastActivityAt");

-- Lead list query filters by userId and orders by createdAt desc.
CREATE INDEX "Lead_userId_createdAt_idx" ON "Lead"("userId", "createdAt");
