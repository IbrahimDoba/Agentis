-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceFxRate" (
    "currency" TEXT NOT NULL,
    "rateToBase" DECIMAL(18,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceFxRate_pkey" PRIMARY KEY ("currency")
);

-- CreateIndex
CREATE INDEX "FinanceEntry_kind_incurredAt_idx" ON "FinanceEntry"("kind", "incurredAt" DESC);
