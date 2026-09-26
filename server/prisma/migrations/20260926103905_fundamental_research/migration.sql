-- CreateTable
CREATE TABLE "ResearchSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ResearchSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSourceCache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSourceCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ResearchReport" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "score" INTEGER,
    "confidence" INTEGER,
    "condition" TEXT,
    "direction" TEXT,
    "payload" JSONB NOT NULL,
    "narrativeSource" TEXT NOT NULL DEFAULT 'rules',
    "model" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT,
    "sourceStatus" JSONB NOT NULL DEFAULT '[]',
    "reportId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAssessment" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "classification" TEXT,
    "statement" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchSourceCache_expiresAt_idx" ON "ResearchSourceCache"("expiresAt");

-- CreateIndex
CREATE INDEX "ResearchReport_kind_subject_createdAt_idx" ON "ResearchReport"("kind", "subject", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchRun_subject_startedAt_idx" ON "ResearchRun"("subject", "startedAt");

-- CreateIndex
CREATE INDEX "ResearchRun_userId_startedAt_idx" ON "ResearchRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "SourceAssessment_currency_factor_idx" ON "SourceAssessment"("currency", "factor");
