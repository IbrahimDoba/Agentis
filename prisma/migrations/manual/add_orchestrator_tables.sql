-- Orchestrator migration: adds LLM agent config, conversations, messages tables
-- Run this against the Neon database

-- 1. Add agent_runtime column to Agent table
ALTER TABLE "Agent"
  ADD COLUMN IF NOT EXISTS "agentRuntime" TEXT NOT NULL DEFAULT 'elevenlabs'
    CHECK ("agentRuntime" IN ('elevenlabs', 'orchestrator'));

-- 2. OrchestratorAgent: LLM agent configuration (one per Agent/business)
CREATE TABLE IF NOT EXISTS "OrchestratorAgent" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "systemPrompt" TEXT NOT NULL,
  "personality" TEXT,
  "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "temperature" NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  "maxOutputTokens" INT NOT NULL DEFAULT 800,
  "shortTermWindow" INT NOT NULL DEFAULT 20,
  "summarizeAfter" INT NOT NULL DEFAULT 30,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orchestrator_agent_agent ON "OrchestratorAgent"("agentId");

-- 3. Conversation: per-phone-per-agent chat thread
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE,
  "orchestratorAgentId" TEXT REFERENCES "OrchestratorAgent"("id") ON DELETE SET NULL,
  "phoneNumber" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'ai' CHECK ("mode" IN ('ai', 'human')),
  "lastActivityAt" TIMESTAMPTZ DEFAULT NOW(),
  "factsExtractedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_agent_phone ON "Conversation"("agentId", "phoneNumber");
CREATE INDEX IF NOT EXISTS idx_conversation_activity ON "Conversation"("lastActivityAt");

-- 4. Message: individual messages in a conversation
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "direction" TEXT NOT NULL CHECK ("direction" IN ('inbound', 'outbound')),
  "content" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "mediaDescription" TEXT,
  "toolCalls" JSONB,
  "tokensInput" INT,
  "tokensOutput" INT,
  "modelUsed" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_conversation ON "Message"("conversationId", "createdAt");

-- 5. ConversationSummary: mid-term memory (PR6)
CREATE TABLE IF NOT EXISTS "ConversationSummary" (
  "conversationId" TEXT PRIMARY KEY REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "summary" TEXT NOT NULL,
  "messagesCovered" INT NOT NULL,
  "summarizedThroughMessageId" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
