-- Trading Game: the Kotka pair on each match, and saved chart layouts.
-- Additive only.

-- AlterTable
ALTER TABLE "GameMatch" ADD COLUMN     "symbol" TEXT;

-- CreateTable
CREATE TABLE "GameChartLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameChartLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameChartLayout_userId_scope_key" ON "GameChartLayout"("userId", "scope");

-- AddForeignKey
ALTER TABLE "GameChartLayout" ADD CONSTRAINT "GameChartLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

