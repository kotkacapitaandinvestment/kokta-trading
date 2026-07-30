-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "positionStatus" TEXT NOT NULL DEFAULT 'closed',
ALTER COLUMN "result" DROP NOT NULL,
ALTER COLUMN "pnl" DROP NOT NULL,
ALTER COLUMN "emotionAfter" DROP NOT NULL;
