-- Pay-as-you-go credits: wallet + token-weighted billing + Paystack purchase log.
-- All changes are additive / nullable / defaulted so existing rows + writers
-- keep working unchanged.

-- 1. Wallet balance + rolling expiry on User.
ALTER TABLE "User"
  ADD COLUMN "creditBalance"   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN "creditsExpireAt" TIMESTAMPTZ;

-- 2. Per-message audit columns on CreditUsage.
--    tokensInput / tokensOutput let us reconstruct the per-message billing in
--    the support UI (and verify it matches what OpenAI billed us).
--    billedTo records whether the credits came from plan allowance or wallet,
--    so we can split revenue recognition cleanly.
ALTER TABLE "CreditUsage"
  ADD COLUMN "tokensInput"  INTEGER,
  ADD COLUMN "tokensOutput" INTEGER,
  ADD COLUMN "billedTo"     TEXT;

-- 3. Audit log of every credit purchase via Paystack. One row per top-up.
--    `reference` is the Paystack transaction reference — unique so duplicate
--    webhook deliveries are no-ops.
CREATE TABLE "CreditPurchase" (
  "id"           TEXT        PRIMARY KEY,
  "userId"       TEXT        NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "amountNaira"  INTEGER     NOT NULL,
  "netNaira"     INTEGER     NOT NULL,
  "creditsAdded" INTEGER     NOT NULL,
  "unitRateNGN"  DECIMAL(6, 3) NOT NULL,
  "reference"    TEXT        NOT NULL UNIQUE,
  "status"       "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt"  TIMESTAMPTZ,
  "expiresAt"    TIMESTAMPTZ NOT NULL
);

CREATE INDEX "CreditPurchase_userId_createdAt_idx"
  ON "CreditPurchase" ("userId", "createdAt" DESC);

CREATE INDEX "CreditPurchase_status_createdAt_idx"
  ON "CreditPurchase" ("status", "createdAt");
