-- Tier-1 scalability indexes. All target tables are small (largest is
-- DocumentChunk ~1.7k rows), so these builds are effectively instant and take
-- only a momentary lock. IF NOT EXISTS keeps it idempotent / safe to re-run.
-- NOTE: WhatsApp auth is NOT in Postgres (Supabase Storage), so none of this
-- touches live sessions — no reconnects/rescans.

-- Agent had ZERO indexes; userId is the app's hottest filter.
CREATE INDEX IF NOT EXISTS "Agent_userId_status_idx" ON "Agent"("userId", "status");
CREATE INDEX IF NOT EXISTS "Agent_agentRuntime_idx" ON "Agent"("agentRuntime");
CREATE INDEX IF NOT EXISTS "Agent_elevenlabsAgentId_idx" ON "Agent"("elevenlabsAgentId");

-- User: admin status counts + the daily renewal/expiry cron scans.
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_plan_subscriptionExpiresAt_idx" ON "User"("plan", "subscriptionExpiresAt");

-- ConversationLog (voice): always listed/exported by agent, newest first.
CREATE INDEX IF NOT EXISTS "ConversationLog_agentId_createdAt_idx" ON "ConversationLog"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationLog_elevenlabsAgentId_createdAt_idx" ON "ConversationLog"("elevenlabsAgentId", "createdAt");

-- FK filters that were unindexed.
CREATE INDEX IF NOT EXISTS "Customer_agentId_idx" ON "Customer"("agentId");
CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX IF NOT EXISTS "PaymentRequest_userId_idx" ON "PaymentRequest"("userId");
CREATE INDEX IF NOT EXISTS "PaymentRequest_status_idx" ON "PaymentRequest"("status");

-- RAG: pgvector ANN index so per-message retrieval stops doing an exact KNN
-- full scan of the agent's chunks. Query uses cosine distance (`<=>`), so
-- vector_cosine_ops. Not expressible in the Prisma schema (embedding is an
-- Unsupported type), hence raw SQL here.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
  ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
