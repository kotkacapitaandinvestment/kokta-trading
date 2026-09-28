-- Usage control: limits, feature switches, one usage ledger, overrides and
-- resets. Additive only; existing tables are not changed.

-- CreateTable
CREATE TABLE "UsageLimit" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'default',
    "meter" TEXT NOT NULL,
    "daily" INTEGER,
    "weekly" INTEGER,
    "monthly" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "warnAtPct" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "UsageLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureControl" (
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "FeatureControl_pkey" PRIMARY KEY ("feature")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "requestKey" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCost" DECIMAL(12,6),
    "latencyMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meter" TEXT NOT NULL,
    "daily" INTEGER,
    "weekly" INTEGER,
    "monthly" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageLimit_scope_meter_key" ON "UsageLimit"("scope", "meter");

-- CreateIndex
CREATE INDEX "UsageRecord_userId_feature_createdAt_idx" ON "UsageRecord"("userId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_feature_createdAt_idx" ON "UsageRecord"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_createdAt_idx" ON "UsageRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_userId_requestKey_key" ON "UsageRecord"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "UsageOverride_userId_meter_idx" ON "UsageOverride"("userId", "meter");

-- CreateIndex
CREATE INDEX "UsageReset_userId_feature_createdAt_idx" ON "UsageReset"("userId", "feature", "createdAt");

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageOverride" ADD CONSTRAINT "UsageOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageReset" ADD CONSTRAINT "UsageReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Data ──────────────────────────────────────────────────────────────────
-- Default limits carry over today's behaviour:
--   Kotka AI: the Platform Settings daily limit (150 unless changed; 0 meant
--   no limit). Fundamental Research: the per-day report updates setting (10
--   unless changed). Market Intelligence: counted, no limit until an admin
--   sets one.
INSERT INTO "UsageLimit" ("id", "scope", "meter", "daily", "weekly", "monthly", "enabled", "warnAtPct", "updatedAt")
SELECT 'usage_limit_kotka_ai', 'default', 'kotka_ai',
  CASE WHEN v IS NULL THEN 150 WHEN v <= 0 THEN NULL ELSE v END, NULL, NULL, true, 80, CURRENT_TIMESTAMP
FROM (SELECT (SELECT CASE WHEN jsonb_typeof("config"->'aiFairUseDailyLimit') = 'number' THEN ("config"->>'aiFairUseDailyLimit')::numeric::int END FROM "AppSettings" WHERE "id" = 'singleton') AS v) s
ON CONFLICT ("scope", "meter") DO NOTHING;

INSERT INTO "UsageLimit" ("id", "scope", "meter", "daily", "weekly", "monthly", "enabled", "warnAtPct", "updatedAt")
SELECT 'usage_limit_fundamental_research', 'default', 'fundamental_research',
  COALESCE(v, 10), NULL, NULL, true, 80, CURRENT_TIMESTAMP
FROM (SELECT (SELECT CASE WHEN jsonb_typeof("config"->'userRefreshLimitPerDay') = 'number' THEN GREATEST(("config"->>'userRefreshLimitPerDay')::numeric::int, 0) END FROM "ResearchSettings" WHERE "id" = 'singleton') AS v) s
ON CONFLICT ("scope", "meter") DO NOTHING;

INSERT INTO "UsageLimit" ("id", "scope", "meter", "daily", "weekly", "monthly", "enabled", "warnAtPct", "updatedAt")
VALUES ('usage_limit_market_intelligence', 'default', 'market_intelligence', NULL, NULL, NULL, true, 80, CURRENT_TIMESTAMP)
ON CONFLICT ("scope", "meter") DO NOTHING;

INSERT INTO "FeatureControl" ("feature", "enabled", "updatedAt")
VALUES ('kotka_ai', true, CURRENT_TIMESTAMP), ('market_intelligence', true, CURRENT_TIMESTAMP), ('fundamental_research', true, CURRENT_TIMESTAMP)
ON CONFLICT ("feature") DO NOTHING;

-- Existing Kotka AI usage, so today's counts carry on. Which feature each
-- old row came from wasn't recorded, so the action is 'legacy'.
INSERT INTO "UsageRecord" ("id", "userId", "feature", "action", "units", "status", "provider", "model", "latencyMs", "metadata", "createdAt", "settledAt")
SELECT 'ailog_' || l."id", l."userId", 'kotka_ai', 'legacy', 1,
  CASE l."source" WHEN 'nvidia' THEN 'consumed' WHEN 'pending' THEN 'abandoned' WHEN 'abandoned' THEN 'abandoned' WHEN 'error' THEN 'failed' ELSE 'released' END,
  CASE WHEN l."source" = 'nvidia' THEN 'nvidia' END,
  CASE WHEN l."model" IN ('pending', 'none', 'community') THEN NULL ELSE l."model" END,
  l."latencyMs",
  jsonb_build_object('copiedFrom', 'AIUsageLog', 'source', l."source"),
  l."createdAt", l."createdAt"
FROM "AIUsageLog" l
ON CONFLICT DO NOTHING;

-- Report updates traders asked for (the old per-day counter).
INSERT INTO "UsageRecord" ("id", "userId", "feature", "action", "units", "status", "latencyMs", "metadata", "createdAt", "settledAt")
SELECT 'rrun_' || r."id", r."userId", 'fundamental_research', 'report_update', 1,
  CASE r."status" WHEN 'succeeded' THEN 'consumed' WHEN 'failed' THEN 'failed' ELSE 'abandoned' END,
  CASE WHEN r."finishedAt" IS NOT NULL THEN LEAST((EXTRACT(EPOCH FROM (r."finishedAt" - r."startedAt")) * 1000)::bigint, 2147483647)::int END,
  jsonb_build_object('copiedFrom', 'ResearchRun', 'subject', r."subject"),
  r."startedAt", r."finishedAt"
FROM "ResearchRun" r
WHERE r."trigger" = 'user' AND r."userId" IS NOT NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = r."userId")
ON CONFLICT DO NOTHING;
