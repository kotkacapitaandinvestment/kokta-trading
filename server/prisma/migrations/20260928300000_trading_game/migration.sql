-- Trading Game: synthetic market matches, wallets, the immutable ledger,
-- deposits, withdrawals and progression. Additive only.

-- CreateTable
CREATE TABLE "GameSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "GameSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'user',
    "userId" TEXT,
    "availableKobo" BIGINT NOT NULL DEFAULT 0,
    "lockedKobo" BIGINT NOT NULL DEFAULT 0,
    "pendingWithdrawKobo" BIGINT NOT NULL DEFAULT 0,
    "promoAvailableKobo" BIGINT NOT NULL DEFAULT 0,
    "promoLockedKobo" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "creditType" TEXT NOT NULL DEFAULT 'cash',
    "amountKobo" BIGINT NOT NULL,
    "availableDelta" BIGINT NOT NULL DEFAULT 0,
    "lockedDelta" BIGINT NOT NULL DEFAULT 0,
    "pendingDelta" BIGINT NOT NULL DEFAULT 0,
    "availableBefore" BIGINT NOT NULL,
    "availableAfter" BIGINT NOT NULL,
    "lockedBefore" BIGINT NOT NULL,
    "lockedAfter" BIGINT NOT NULL,
    "pendingBefore" BIGINT NOT NULL,
    "pendingAfter" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "matchId" TEXT,
    "depositId" TEXT,
    "withdrawalId" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "providerRef" TEXT,
    "providerPaymentId" TEXT,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "payoutAccountId" TEXT,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "bankName" TEXT,
    "accountLast4" TEXT,
    "accountName" TEXT,
    "nameMatchesId" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMatch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'duel',
    "status" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "scenarioCode" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "generatorVersion" INTEGER NOT NULL,
    "marketHash" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "candleSec" INTEGER NOT NULL,
    "historyCandles" INTEGER NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startingCapital" INTEGER NOT NULL,
    "stakeKobo" BIGINT NOT NULL DEFAULT 0,
    "feeBps" INTEGER NOT NULL DEFAULT 0,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "creatorId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "rematchOfId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "readyBy" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "result" JSONB,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "finalEquity" DOUBLE PRECISION,
    "returnPct" DOUBLE PRECISION,
    "maxDrawdownPct" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "subscores" JSONB,
    "report" JSONB,
    "outcome" TEXT,
    "payoutKobo" BIGINT NOT NULL DEFAULT 0,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "tick" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "requestKey" TEXT,
    "clientTick" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMatchTransition" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMatchTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameProfile" (
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GameBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "matchId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_idempotencyKey_key" ON "WalletEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletEntry_userId_createdAt_idx" ON "WalletEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletEntry_matchId_idx" ON "WalletEntry"("matchId");

-- CreateIndex
CREATE INDEX "WalletEntry_type_createdAt_idx" ON "WalletEntry"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_provider_providerRef_key" ON "Deposit"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAccount_userId_provider_key" ON "PayoutAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "GameMatch_code_key" ON "GameMatch"("code");

-- CreateIndex
CREATE INDEX "GameMatch_status_createdAt_idx" ON "GameMatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GameMatch_creatorId_createdAt_idx" ON "GameMatch"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "GameMatch_invitedUserId_status_idx" ON "GameMatch"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "GameMatch_isOpen_status_idx" ON "GameMatch"("isOpen", "status");

-- CreateIndex
CREATE INDEX "GamePlayer_userId_createdAt_idx" ON "GamePlayer"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_matchId_userId_key" ON "GamePlayer"("matchId", "userId");

-- CreateIndex
CREATE INDEX "GameAction_matchId_tick_idx" ON "GameAction"("matchId", "tick");

-- CreateIndex
CREATE UNIQUE INDEX "GameAction_matchId_userId_seq_key" ON "GameAction"("matchId", "userId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "GameAction_matchId_userId_requestKey_key" ON "GameAction"("matchId", "userId", "requestKey");

-- CreateIndex
CREATE INDEX "GameMatchTransition_matchId_createdAt_idx" ON "GameMatchTransition"("matchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameBadge_userId_badge_key" ON "GameBadge"("userId", "badge");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "GameMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAction" ADD CONSTRAINT "GameAction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "GameMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatchTransition" ADD CONSTRAINT "GameMatchTransition_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "GameMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameProfile" ADD CONSTRAINT "GameProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameBadge" ADD CONSTRAINT "GameBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The house wallet: platform fees are credited here.
INSERT INTO "Wallet" ("id", "kind", "userId", "updatedAt") VALUES ('house', 'house', NULL, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
