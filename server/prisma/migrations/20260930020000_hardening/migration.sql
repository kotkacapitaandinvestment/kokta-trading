-- Hardening: a secret per match for the market's randomness, a wallet
-- freeze for refunds and chargebacks, and push subscriptions tied to the
-- session that made them. Additive only.

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "frozenReason" TEXT;

-- AlterTable
ALTER TABLE "GameMatch" ADD COLUMN     "secret" TEXT;

-- CreateIndex
CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");

