-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "goalRoomPreferences" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT,
    "target" DOUBLE PRECISION NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lockedAt" TIMESTAMP(3),
    "achievedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "verification" TEXT NOT NULL DEFAULT 'self_reported',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "traded" BOOLEAN NOT NULL,
    "planFollowed" BOOLEAN,
    "riskRespected" BOOLEAN,
    "noRevengeTrading" BOOLEAN,
    "learning" INTEGER NOT NULL DEFAULT 0,
    "backtests" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "goalId" TEXT,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification" TEXT NOT NULL DEFAULT 'self_reported',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "postId" TEXT,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementShare" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fields" TEXT[],
    "snapshot" JSONB NOT NULL,
    "imageId" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoalCheckIn_userId_date_key" ON "GoalCheckIn"("userId", "date");

-- CreateIndex
CREATE INDEX "Achievement_userId_earnedAt_idx" ON "Achievement"("userId", "earnedAt");

-- CreateIndex
CREATE INDEX "Achievement_type_earnedAt_idx" ON "Achievement"("type", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_key_key" ON "Achievement"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementShare_slug_key" ON "AchievementShare"("slug");

-- CreateIndex
CREATE INDEX "AchievementShare_userId_createdAt_idx" ON "AchievementShare"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementShare" ADD CONSTRAINT "AchievementShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

