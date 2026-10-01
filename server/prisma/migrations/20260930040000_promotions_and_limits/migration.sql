-- Promotional credits (campaigns, grants, per-stake sources, restricted winnings)
-- and responsible-play limits and breaks. Additive only: new tables, and new
-- columns that start at zero for every existing row.

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "restrictedKobo" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WalletEntry" ADD COLUMN     "promoAfter" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "promoBefore" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "promoDelta" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "promoLockedAfter" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "promoLockedBefore" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "promoLockedDelta" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "restrictedAfter" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "restrictedBefore" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "restrictedDelta" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GamePlayer" ADD COLUMN     "stakePromoExpiresAt" TIMESTAMP(3),
ADD COLUMN     "stakePromoKobo" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "stakeRestrictedKobo" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PromoCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amountKobo" BIGINT NOT NULL,
    "expiresInDays" INTEGER NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxGrants" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "amountKobo" BIGINT NOT NULL,
    "remainingKobo" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayLimits" (
    "userId" TEXT NOT NULL,
    "depositDayKobo" BIGINT,
    "depositWeekKobo" BIGINT,
    "depositMonthKobo" BIGINT,
    "stakeDayKobo" BIGINT,
    "pendingLimits" JSONB,
    "pendingFrom" TIMESTAMP(3),
    "breakUntil" TIMESTAMP(3),
    "excludedUntil" TIMESTAMP(3),
    "excludedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayLimits_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "PromoGrant_userId_expiresAt_idx" ON "PromoGrant"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "PromoGrant_expiresAt_idx" ON "PromoGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoGrant_userId_campaignId_key" ON "PromoGrant"("userId", "campaignId");

-- AddForeignKey
ALTER TABLE "PromoGrant" ADD CONSTRAINT "PromoGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoGrant" ADD CONSTRAINT "PromoGrant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromoCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayLimits" ADD CONSTRAINT "PlayLimits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

