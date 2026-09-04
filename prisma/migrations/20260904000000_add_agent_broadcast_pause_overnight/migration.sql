-- Per-agent toggle: pause broadcasts overnight (23:00–06:00 local). Default on.
ALTER TABLE "Agent" ADD COLUMN "broadcastPauseOvernight" BOOLEAN NOT NULL DEFAULT true;
