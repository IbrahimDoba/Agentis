-- Global per-agent "AI replies" master switch. When false, the orchestrator
-- skips AI for ALL of the agent's conversations (everything goes to a human),
-- independent of per-conversation mode. Defaults true so nothing changes for
-- existing agents.
ALTER TABLE "Agent" ADD COLUMN "aiRepliesEnabled" BOOLEAN NOT NULL DEFAULT true;
