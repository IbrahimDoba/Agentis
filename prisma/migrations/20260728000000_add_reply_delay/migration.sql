-- Per-agent reply delay + message coalescing window. Seconds to wait before the
-- AI replies; also the debounce window in which rapid customer messages are
-- batched into one combined reply. 0 = reply instantly (no batching).
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "replyDelaySeconds" INTEGER NOT NULL DEFAULT 0;
