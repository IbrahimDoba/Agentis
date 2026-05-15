-- Embeddable AI chat widget for external websites.
-- One EmbedSite per Agent (1:1) — holds the public key shown in the snippet,
-- the CORS allowlist of origins permitted to talk to the embed API, the
-- theme JSON (greeting, primary color, etc.), and an isActive kill switch.
CREATE TABLE "EmbedSite" (
  "id"             TEXT PRIMARY KEY,
  "agentId"        TEXT NOT NULL UNIQUE,
  "publicKey"      TEXT NOT NULL UNIQUE,
  "allowedOrigins" TEXT[] NOT NULL DEFAULT '{}',
  "themeJson"      JSONB,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmbedSite_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

CREATE INDEX "EmbedSite_publicKey_idx" ON "EmbedSite"("publicKey");

-- Tag conversations with the channel they originated on so the dashboard
-- and orchestrator can branch behaviour (e.g. anti-ban pacing only applies
-- to whatsapp). visitorId is the per-browser anonymous identifier persisted
-- in localStorage; only populated when channel = 'embed'.
ALTER TABLE "Conversation"
  ADD COLUMN "channel"   TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN "visitorId" TEXT;

CREATE INDEX "Conversation_agentId_visitorId_idx"
  ON "Conversation"("agentId", "visitorId");
