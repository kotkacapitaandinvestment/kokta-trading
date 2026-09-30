-- Trading Arena: presence and Ready to Trade on the game profile, and the
-- Quick Match queue. Additive only.

-- AlterTable
ALTER TABLE "GameProfile" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "readyToTrade" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GameQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stakeKobo" BIGINT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameQueue_userId_key" ON "GameQueue"("userId");

-- CreateIndex
CREATE INDEX "GameQueue_stakeKobo_durationSec_createdAt_idx" ON "GameQueue"("stakeKobo", "durationSec", "createdAt");

-- CreateIndex
CREATE INDEX "GameProfile_lastSeenAt_idx" ON "GameProfile"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "GameQueue" ADD CONSTRAINT "GameQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

