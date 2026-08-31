-- Cold outreach pilot. Four additive tables, no changes to any existing table:
-- SignupAttribution holds userId as a plain unique column rather than a relation
-- precisely so "User" is not touched by this migration.

CREATE TABLE "OutreachProspect" (
  "id"                 TEXT NOT NULL,
  "businessName"       TEXT NOT NULL,
  "email"              TEXT NOT NULL,
  "emailDomain"        TEXT NOT NULL,
  "emailHash"          TEXT NOT NULL,
  "contactName"        TEXT,
  "vertical"           TEXT,
  "city"               TEXT,
  "phone"              TEXT,
  "whatsappNumber"     TEXT,
  "website"            TEXT,
  "instagram"          TEXT,
  "sourceLabel"        TEXT NOT NULL,
  "sourceUrl"          TEXT NOT NULL,
  "research"           JSONB,
  "fitScore"           INTEGER NOT NULL DEFAULT 0,
  "status"             TEXT NOT NULL DEFAULT 'new',
  "disqualifiedReason" TEXT,
  "demoAgentId"        TEXT,
  "demoSlug"           TEXT,
  "demoExpiresAt"      TIMESTAMPTZ,
  "convertedUserId"    TEXT,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMPTZ NOT NULL,
  CONSTRAINT "OutreachProspect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutreachProspect_email_key" ON "OutreachProspect"("email");
CREATE UNIQUE INDEX "OutreachProspect_emailHash_key" ON "OutreachProspect"("emailHash");
CREATE UNIQUE INDEX "OutreachProspect_demoSlug_key" ON "OutreachProspect"("demoSlug");
CREATE INDEX "OutreachProspect_status_fitScore_idx" ON "OutreachProspect"("status", "fitScore");
CREATE INDEX "OutreachProspect_emailDomain_idx" ON "OutreachProspect"("emailDomain");

CREATE TABLE "OutreachMessage" (
  "id"                TEXT NOT NULL,
  "prospectId"        TEXT NOT NULL,
  "step"              INTEGER NOT NULL DEFAULT 1,
  "toEmail"           TEXT NOT NULL,
  "subject"           TEXT NOT NULL,
  "bodyText"          TEXT NOT NULL,
  "aiReason"          TEXT,
  "aiSignals"         JSONB,
  "aiModel"           TEXT,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "reviewedAt"        TIMESTAMPTZ,
  "sentAt"            TIMESTAMPTZ,
  "providerMessageId" TEXT,
  "error"             TEXT,
  "token"             TEXT NOT NULL,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutreachMessage_providerMessageId_key" ON "OutreachMessage"("providerMessageId");
CREATE UNIQUE INDEX "OutreachMessage_token_key" ON "OutreachMessage"("token");
CREATE UNIQUE INDEX "OutreachMessage_prospectId_step_key" ON "OutreachMessage"("prospectId", "step");
CREATE INDEX "OutreachMessage_status_sentAt_idx" ON "OutreachMessage"("status", "sentAt");

ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "OutreachProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OutreachSuppression" (
  "id"        TEXT NOT NULL,
  "scope"     TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "reason"    TEXT NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutreachSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutreachSuppression_scope_value_key" ON "OutreachSuppression"("scope", "value");

CREATE TABLE "SignupAttribution" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "prospectId"  TEXT,
  "source"      TEXT,
  "medium"      TEXT,
  "campaign"    TEXT,
  "clickToken"  TEXT,
  "landingPath" TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignupAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignupAttribution_userId_key" ON "SignupAttribution"("userId");
CREATE INDEX "SignupAttribution_prospectId_idx" ON "SignupAttribution"("prospectId");
