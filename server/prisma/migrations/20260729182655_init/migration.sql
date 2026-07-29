-- CreateEnum
CREATE TYPE "Role" AS ENUM ('trader', 'premium', 'admin');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'trader',
    "plan" TEXT NOT NULL DEFAULT 'Free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL,
    "risk" DOUBLE PRECISION NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "result" TEXT NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL,
    "emotionBefore" TEXT NOT NULL,
    "emotionAfter" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "mistakes" TEXT NOT NULL DEFAULT '',
    "lessons" TEXT NOT NULL DEFAULT '',
    "checklistComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ChecklistDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifications" JSONB NOT NULL DEFAULT '{"checklist": true, "journal": true, "riskWarnings": true, "weeklyReview": true, "aiInsights": false}',
    "aiPreferences" JSONB NOT NULL DEFAULT '{"tone": "Direct & challenging", "autoSuggest": true, "rememberContext": true}',
    "tradingPreferences" JSONB NOT NULL DEFAULT '{"baseCurrency": "USD", "dailyLossLimit": 2, "defaultRisk": 1}',

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "JournalEntry_userId_idx" ON "JournalEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistDay_userId_date_key" ON "ChecklistDay"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistDay" ADD CONSTRAINT "ChecklistDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
