-- Status -> Autopilot: a plan per agent, tags and an opt-out on gallery cards,
-- and a source + slot key on posts. All additive with defaults; existing posts
-- become source 'manual' and nothing changes for agents without a plan.
-- AlterTable
ALTER TABLE "StatusGalleryItem" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "autopilot" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "StatusPost" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "autopilotKey" TEXT;

-- CreateTable
CREATE TABLE "StatusAutopilot" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "mode" TEXT NOT NULL,
    "instructions" TEXT,
    "plan" JSONB NOT NULL,
    "resumedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "StatusAutopilot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatusAutopilot_agentId_key" ON "StatusAutopilot"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusPost_agentId_autopilotKey_key" ON "StatusPost"("agentId", "autopilotKey");

-- AddForeignKey
ALTER TABLE "StatusAutopilot" ADD CONSTRAINT "StatusAutopilot_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
