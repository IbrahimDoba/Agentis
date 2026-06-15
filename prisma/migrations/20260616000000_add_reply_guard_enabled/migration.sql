-- Reply guard toggle: when on, a second model reviews each AI reply before
-- sending (rewrite / handoff / suppress). Off by default — the guard can
-- over-suppress and silence legitimate replies; enable per agent once trusted.
ALTER TABLE "Agent" ADD COLUMN "replyGuardEnabled" BOOLEAN NOT NULL DEFAULT false;
