-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "aiReview" TEXT,
ADD COLUMN "aiReviewModel" TEXT,
ADD COLUMN "aiReviewAt" TIMESTAMP(3);
