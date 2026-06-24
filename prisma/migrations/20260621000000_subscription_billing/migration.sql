-- Paystack recurring subscription billing.
-- Adds saved-card / auto-renew fields to "User", a FAILED payment status, and
-- the "SubscriptionCharge" ledger (idempotency anchor for plan charges).

-- AlterEnum: PG15 allows ADD VALUE in a transaction as long as it isn't used in
-- the same migration (it isn't — no data here references FAILED).
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- AlterTable: User — Paystack recurring billing state
ALTER TABLE "User"
  ADD COLUMN "paystackAuthorizationCode" TEXT,
  ADD COLUMN "paystackCustomerCode" TEXT,
  ADD COLUMN "cardLast4" TEXT,
  ADD COLUMN "cardBrand" TEXT,
  ADD COLUMN "cardExpiry" TEXT,
  ADD COLUMN "authorizationReusable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pendingPlan" TEXT,
  ADD COLUMN "renewalRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastRenewalAttemptAt" TIMESTAMP(3),
  ADD COLUMN "paymentFailedEmailSentAt" TIMESTAMP(3);

-- CreateTable: SubscriptionCharge
CREATE TABLE "SubscriptionCharge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "amountNaira" INTEGER NOT NULL,
  "planNaira" INTEGER NOT NULL,
  "overageNaira" INTEGER NOT NULL DEFAULT 0,
  "netNaira" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "kind" TEXT NOT NULL DEFAULT 'renewal',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionCharge_reference_key" ON "SubscriptionCharge"("reference");
CREATE INDEX "SubscriptionCharge_userId_createdAt_idx" ON "SubscriptionCharge"("userId", "createdAt" DESC);
CREATE INDEX "SubscriptionCharge_status_createdAt_idx" ON "SubscriptionCharge"("status", "createdAt");

ALTER TABLE "SubscriptionCharge"
  ADD CONSTRAINT "SubscriptionCharge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
