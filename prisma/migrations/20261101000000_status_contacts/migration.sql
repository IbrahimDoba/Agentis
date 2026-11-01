-- Status -> Contacts: mirror of the phone's address book, bulk "save my chats"
-- runs, and the per-agent auto-save switch + name tag. New tables and nullable /
-- defaulted columns only; nothing changes for existing agents until an owner
-- starts a run or turns auto-save on.
-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "autoSaveContacts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactNameTag" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "savedBy" TEXT NOT NULL DEFAULT 'phone',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactSaveRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pauseReason" TEXT,
    "waitingUntil" TIMESTAMPTZ,
    "nameTag" TEXT,
    "cursor" TEXT,
    "totalCount" INTEGER NOT NULL,
    "savedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "ContactSaveRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContact_agentId_phone_key" ON "WhatsAppContact"("agentId", "phone");

-- CreateIndex
CREATE INDEX "ContactSaveRun_agentId_createdAt_idx" ON "ContactSaveRun"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSaveRun" ADD CONSTRAINT "ContactSaveRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

