CREATE TABLE "ConversationLog" (
  "id"                TEXT         NOT NULL,
  "conversationId"    TEXT         NOT NULL,
  "elevenlabsAgentId" TEXT         NOT NULL,
  "agentId"           TEXT,
  "phoneNumber"       TEXT,
  "transcript"        JSONB        NOT NULL,
  "summary"           TEXT,
  "durationSecs"      INTEGER,
  "startTime"         TIMESTAMP(3),
  "status"            TEXT,
  "rawPayload"        JSONB        NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationLog_conversationId_key" ON "ConversationLog"("conversationId");

CREATE INDEX "ConversationLog_elevenlabsAgentId_idx" ON "ConversationLog"("elevenlabsAgentId");
CREATE INDEX "ConversationLog_phoneNumber_idx" ON "ConversationLog"("phoneNumber");
CREATE INDEX "ConversationLog_agentId_idx" ON "ConversationLog"("agentId");

ALTER TABLE "ConversationLog"
  ADD CONSTRAINT "ConversationLog_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
