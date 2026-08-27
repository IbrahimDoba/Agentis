-- Per-message sender attribution. Null for every existing row and for all 1:1
-- traffic; only group inbound populates these.
ALTER TABLE "Message" ADD COLUMN "senderJid" TEXT;
ALTER TABLE "Message" ADD COLUMN "senderName" TEXT;

-- Per-agent opt-in. Groups stay dropped at ingest unless this is on.
ALTER TABLE "Agent" ADD COLUMN "groupChatEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "GroupChat" (
  "id"             TEXT NOT NULL,
  "agentId"        TEXT NOT NULL,
  "groupJid"       TEXT NOT NULL,
  "subject"        TEXT,
  "conversationId" TEXT,
  "replyMode"      TEXT NOT NULL DEFAULT 'mention',
  "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt"  TIMESTAMP(3),
  CONSTRAINT "GroupChat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupChat_agentId_groupJid_key" ON "GroupChat"("agentId", "groupJid");
CREATE UNIQUE INDEX "GroupChat_conversationId_key" ON "GroupChat"("conversationId");
CREATE INDEX "GroupChat_agentId_idx" ON "GroupChat"("agentId");

ALTER TABLE "GroupChat" ADD CONSTRAINT "GroupChat_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupChat" ADD CONSTRAINT "GroupChat_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
