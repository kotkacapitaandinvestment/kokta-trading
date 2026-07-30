/*
  Warnings:

  - You are about to drop the column `difficulty` on the `SimulatorSession` table. All the data in the column will be lost.
  - You are about to drop the column `isBest` on the `SimulatorSession` table. All the data in the column will be lost.
  - You are about to drop the column `overall` on the `SimulatorSession` table. All the data in the column will be lost.
  - Added the required column `balance` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bars` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `symbol` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ticker` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeframeMultiplier` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeframeUnit` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `windowEnd` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `windowStart` to the `SimulatorSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SimulatorSession" DROP COLUMN "difficulty",
DROP COLUMN "isBest",
DROP COLUMN "overall",
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "bars" JSONB NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "cursor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startingBalance" DOUBLE PRECISION NOT NULL DEFAULT 10000,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "symbol" TEXT NOT NULL,
ADD COLUMN     "ticker" TEXT NOT NULL,
ADD COLUMN     "timeframeMultiplier" INTEGER NOT NULL,
ADD COLUMN     "timeframeUnit" TEXT NOT NULL,
ADD COLUMN     "windowEnd" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "windowStart" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "SimulatorTrade" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "entryBarIndex" INTEGER NOT NULL,
    "entryAt" TIMESTAMP(3) NOT NULL,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "exitBarIndex" INTEGER,
    "exitAt" TIMESTAMP(3),
    "pnl" DOUBLE PRECISION,
    "result" TEXT,
    "closeReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulatorTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulatorTrade_sessionId_idx" ON "SimulatorTrade"("sessionId");

-- AddForeignKey
ALTER TABLE "SimulatorTrade" ADD CONSTRAINT "SimulatorTrade_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SimulatorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
