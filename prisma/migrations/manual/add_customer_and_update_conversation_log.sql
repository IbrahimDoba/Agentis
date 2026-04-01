CREATE TABLE "Customer" (
  "id"                  TEXT         NOT NULL,
  "phoneNumber"         TEXT         NOT NULL,
  "agentId"             TEXT,
  "name"                TEXT,
  "email"               TEXT,
  "conversationSummary" TEXT,
  "lastSeen"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON "Customer"("phoneNumber");
CREATE INDEX "Customer_agentId_idx" ON "Customer"("agentId");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add customerId to ConversationLog
ALTER TABLE "ConversationLog" ADD COLUMN "customerId" TEXT;

CREATE INDEX "ConversationLog_customerId_idx" ON "ConversationLog"("customerId");

ALTER TABLE "ConversationLog"
  ADD CONSTRAINT "ConversationLog_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
