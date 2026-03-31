CREATE TYPE IF NOT EXISTS "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

CREATE TABLE IF NOT EXISTS "Lead" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "agentId"        TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "callerNumber"   TEXT,
  "summary"        TEXT,
  "status"         "LeadStatus" NOT NULL DEFAULT 'NEW',
  "notes"          TEXT,
  "aiDetected"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE,
  CONSTRAINT "Lead_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id")  ON DELETE CASCADE,
  CONSTRAINT "Lead_conversationId_userId_key" UNIQUE ("conversationId", "userId")
);

CREATE TABLE IF NOT EXISTS "ConversationRead" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "readAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ConversationRead_conversationId_userId_key" UNIQUE ("conversationId", "userId")
);
