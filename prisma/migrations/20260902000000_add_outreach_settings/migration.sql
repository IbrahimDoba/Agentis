-- Campaign settings an operator changes while a campaign is running, moved out
-- of env so slowing sending down does not require a redeploy. Single row,
-- upserted on first read. Secrets stay in env.

CREATE TABLE "OutreachSettings" (
  "id"              TEXT NOT NULL DEFAULT 'default',
  "dailyCap"        INTEGER NOT NULL DEFAULT 10,
  "hourlyCap"       INTEGER NOT NULL DEFAULT 5,
  "sliceSize"       INTEGER NOT NULL DEFAULT 3,
  "warmupStartedAt" TIMESTAMPTZ,
  "whatsappNumber"  TEXT,
  "fromName"        TEXT NOT NULL DEFAULT 'Dailzero',
  "signerName"      TEXT NOT NULL DEFAULT 'Ibrahim Doba',
  "signerTitle"     TEXT NOT NULL DEFAULT 'CEO, Dailzero',
  "htmlEnabled"     BOOLEAN NOT NULL DEFAULT true,
  "logoUrl"         TEXT,
  "sendingEnabled"  BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"       TIMESTAMPTZ NOT NULL,
  "updatedBy"       TEXT,
  CONSTRAINT "OutreachSettings_pkey" PRIMARY KEY ("id")
);
