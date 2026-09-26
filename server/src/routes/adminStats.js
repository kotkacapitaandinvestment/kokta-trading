import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { effectiveModels } from '../lib/aiModels.js';
import { cronJobView } from '../lib/cronJobOrg.js';
import { loadSettings as loadResearchSettings } from '../lib/research/settings.js';
import { loadAppSettings } from '../lib/appSettings.js';

export const adminStatsRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

adminStatsRouter.get('/ai-usage', asyncHandler(async (req, res) => {
  const since30d = daysAgo(30);
  const todayStart = startOfDay();

  const [logs30d, requestsToday] = await Promise.all([
    prisma.aIUsageLog.findMany({ where: { createdAt: { gte: since30d } } }),
    prisma.aIUsageLog.count({ where: { createdAt: { gte: todayStart } } }),
  ]);

  const totalRequests = logs30d.length;
  const avgLatencyMs = totalRequests ? Math.round(logs30d.reduce((s, l) => s + l.latencyMs, 0) / totalRequests) : 0;
  const liveCount = logs30d.filter((l) => l.source === 'nvidia').length;

  const byModel = {};
  for (const l of logs30d) {
    const key = `${l.source === 'nvidia' ? l.model : 'Not answered (AI unavailable or error)'}`;
    if (!byModel[key]) byModel[key] = { model: key, requests: 0, totalLatency: 0 };
    byModel[key].requests += 1;
    byModel[key].totalLatency += l.latencyMs;
  }
  const models = Object.values(byModel)
    .map((m) => ({ model: m.model, requests: m.requests, avgLatencyMs: Math.round(m.totalLatency / m.requests) }))
    .sort((a, b) => b.requests - a.requests);

  res.json({
    totalRequests30d: totalRequests,
    requestsToday,
    avgLatencyMs,
    liveSharePct: totalRequests ? Math.round((liveCount / totalRequests) * 100) : 0,
    models,
  });
}));

adminStatsRouter.get('/trading', asyncHandler(async (req, res) => {
  const since30d = daysAgo(30);
  const entries = await prisma.journalEntry.findMany({ where: { createdAt: { gte: since30d } } });

  const total = entries.length;
  const wins = entries.filter((e) => e.result === 'win').length;
  const winRate = total ? Math.round((wins / total) * 100) : 0;
  const checklistCompleted = entries.filter((e) => e.checklistComplete).length;
  const checklistRate = total ? Math.round((checklistCompleted / total) * 100) : 0;
  const withReward = entries.filter((e) => e.reward);
  const avgRR = withReward.length
    ? Math.round((withReward.reduce((s, e) => s + e.reward, 0) / withReward.length) * 10) / 10
    : null;

  const byMarket = {};
  for (const e of entries) {
    if (!byMarket[e.market]) byMarket[e.market] = { market: e.market, trades: 0, wins: 0 };
    byMarket[e.market].trades += 1;
    if (e.result === 'win') byMarket[e.market].wins += 1;
  }
  const markets = Object.values(byMarket)
    .map((m) => ({ market: m.market, trades: m.trades, winRate: Math.round((m.wins / m.trades) * 100) }))
    .sort((a, b) => b.trades - a.trades);

  res.json({ tradesLogged30d: total, winRate, checklistRate, avgRR, markets });
}));

adminStatsRouter.get('/journal', asyncHandler(async (req, res) => {
  const since30d = daysAgo(30);
  const entries = await prisma.journalEntry.findMany({ where: { createdAt: { gte: since30d } } });

  const total = entries.length;
  const activeUsers = new Set(entries.map((e) => e.userId)).size;
  const entriesPerActiveUser = activeUsers ? Math.round((total / activeUsers) * 10) / 10 : 0;
  const withMistakes = entries.filter((e) => e.mistakes && e.mistakes.trim().length > 0).length;
  const avgConfidence = total ? Math.round((entries.reduce((s, e) => s + e.confidence, 0) / total) * 10) / 10 : 0;

  const byEmotion = {};
  for (const e of entries) {
    if (!e.emotionBefore) continue;
    byEmotion[e.emotionBefore] = (byEmotion[e.emotionBefore] || 0) + 1;
  }
  const emotions = Object.entries(byEmotion)
    .map(([emotion, count]) => ({ emotion, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);

  res.json({
    entriesLogged30d: total,
    entriesPerActiveUser,
    mistakeLoggedRate: total ? Math.round((withMistakes / total) * 100) : 0,
    avgConfidence,
    emotions,
  });
}));

adminStatsRouter.get('/overview', asyncHandler(async (req, res) => {
  const todayStart = startOfDay();
  const since30d = daysAgo(30);

  const [totalUsers, newSignups30d, dau, mau, aiRequestsToday, journalEntries30d] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since30d } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: since30d } } }),
    prisma.aIUsageLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.journalEntry.count({ where: { createdAt: { gte: since30d } } }),
  ]);

  const dailyActive = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = startOfDay(daysAgo(i));
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const count = await prisma.user.count({ where: { lastLoginAt: { gte: dayStart, lt: dayEnd } } });
    dailyActive.push({ day: dayStart.toISOString().slice(5, 10), dau: count });
  }

  const [pendingKyc, newSignups7d] = await Promise.all([
    prisma.kycProfile.count({ where: { status: 'pending' } }),
    prisma.user.count({ where: { createdAt: { gte: daysAgo(7) } } }),
  ]);
  const aiUsageCount30d = await prisma.aIUsageLog.count({ where: { createdAt: { gte: since30d } } });
  const checklistDays30d = await prisma.checklistDay.count({ where: { date: { gte: since30d.toISOString().slice(0, 10) } } });

  res.json({
    totalUsers,
    newSignups30d,
    newSignups7d,
    pendingKyc,
    dau,
    mau,
    aiRequestsToday,
    dailyActive,
    featureUsage: [
      { feature: 'Kotka AI', count: aiUsageCount30d },
      { feature: 'Journal', count: journalEntries30d },
      { feature: 'Checklist', count: checklistDays30d },
    ].sort((a, b) => b.count - a.count),
  });
}));

// Live checks of everything Kotka depends on. Each check reports what it
// actually observed; nothing is assumed healthy.
const PROVIDERS = [
  { key: 'nvidia', name: 'NVIDIA (Kotka AI)', role: 'AI chat, chart reading, research narratives, journal reviews' },
  { key: 'massive', name: 'Massive', role: 'End-of-day prices and volatility' },
  { key: 'fred', name: 'FRED', role: 'US data for research (works without a key)' },
  { key: 'cronjob', name: 'cron-job.org', role: 'Hourly research refresh and AI model checks' },
  { key: 'paystack', name: 'Paystack', role: 'Billing (not used while paid plans are off)' },
  { key: 'finnhub', name: 'Finnhub', role: 'Not used' },
];

adminStatsRouter.get('/system', asyncHandler(async (req, res) => {
  const dbStarted = Date.now();
  let database;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, latencyMs: Date.now() - dbStarted };
  } catch (err) {
    database = { ok: false, error: String(err.message).slice(0, 160) };
  }

  const rows = await prisma.integration.findMany();
  const byKey = Object.fromEntries(rows.map((r) => [r.provider, r]));
  const integrations = PROVIDERS.map((p) => {
    const r = byKey[p.key];
    return { key: p.key, name: p.name, role: p.role, configured: !!r?.secretCipher, enabled: !!r?.enabled, updatedAt: r?.updatedAt ?? null };
  });

  const nvidia = byKey.nvidia;
  const cfg = nvidia?.config ?? {};
  const health = Object.entries(cfg.modelHealth ?? {}).map(([model, h]) => ({ model, ...h }));
  const researchSettings = await loadResearchSettings();
  const ai = nvidia?.enabled
    ? {
        configured: true,
        active: effectiveModels(nvidia, { narrativePreferred: researchSettings.model?.trim() || undefined }),
        checkedAt: cfg.modelHealthCheckedAt ?? null,
        healthy: health.filter((h) => h.status === 'ok').length,
        unhealthy: health.filter((h) => h.status !== 'ok').map((h) => ({ model: h.model, status: h.status })),
        recentEvents: (cfg.modelEvents ?? []).slice(0, 5),
      }
    : { configured: false };

  const [lastRun, lastCronRun, runs24h, failed24h] = await Promise.all([
    prisma.researchRun.findFirst({ where: { status: { in: ['succeeded', 'failed'] } }, orderBy: { startedAt: 'desc' } }),
    prisma.researchRun.findFirst({ where: { trigger: 'cron' }, orderBy: { startedAt: 'desc' } }),
    prisma.researchRun.count({ where: { startedAt: { gte: daysAgo(1) } } }),
    prisma.researchRun.count({ where: { startedAt: { gte: daysAgo(1) }, status: 'failed' } }),
  ]);
  const sources = lastRun?.sourceStatus ?? [];
  const research = {
    enabled: researchSettings.enabled,
    lastRunAt: lastRun?.startedAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
    lastCronRunAt: lastCronRun?.startedAt ?? null,
    runs24h,
    failed24h,
    sourcesOk: sources.filter((s) => s.status !== 'failed' && s.status !== 'disabled').length,
    sourcesFailed: sources.filter((s) => s.status === 'failed').map((s) => s.name),
  };

  const since24h = daysAgo(1);
  const [failedLogins24h, signups24h, pendingKyc] = await Promise.all([
    prisma.authAttempt.count({ where: { kind: 'login', success: false, createdAt: { gte: since24h } } }),
    prisma.user.count({ where: { createdAt: { gte: since24h } } }),
    prisma.kycProfile.count({ where: { status: 'pending' } }),
  ]);

  res.json({
    checkedAt: new Date(),
    database,
    integrations,
    ai,
    research,
    cronJob: await cronJobView(researchSettings),
    security: { failedLogins24h, signups24h, pendingKyc },
    platform: await loadAppSettings(),
    runtime: { node: process.version, region: process.env.VERCEL_REGION ?? 'local', deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
  });
}));
