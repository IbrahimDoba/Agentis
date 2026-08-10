-- WhatsApp Business Accounts connected through Embedded Signup (branch:
-- meta-integration). One row per connected phone number; accessToken holds the
-- AES-256-GCM encrypted business token (see src/lib/meta/crypto.ts).
CREATE TABLE IF NOT EXISTS "MetaTestConnection" (
    "id" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "businessId" TEXT,
    "accessToken" BYTEA NOT NULL,
    "registeredAt" TIMESTAMPTZ,
    "subscribedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaTestConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaTestConnection_phoneNumberId_key" ON "MetaTestConnection"("phoneNumberId");
CREATE INDEX IF NOT EXISTS "MetaTestConnection_wabaId_idx" ON "MetaTestConnection"("wabaId");
