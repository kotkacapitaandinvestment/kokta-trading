import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { CURRENCIES, parseSubject } from '../lib/research/currencies.js';
import { loadSettings, publicSettings, verifyCronToken } from '../lib/research/settings.js';
import { latestReport, freshnessOf, activeRun, runResearch, reportHistory, runCronBatch, ResearchError } from '../lib/research/engine.js';
import { checkModelHealth } from '../lib/aiModels.js';

export const researchRouter = Router();

const PREMIUM_ROLES = ['premium', 'admin', 'super_admin'];
const ADMIN_ROLES = ['admin', 'super_admin'];

// ── Scheduled maintenance (cron-job.org) — token auth, no session ─────────
// Responds immediately (cron-job.org's free tier times out after ~30s) and
// continues in the background via waitUntil: refreshes stale research pairs
// and re-tests the AI models (throttled to every 6 hours), so a model NVIDIA
// retires is replaced before traders hit it.
researchRouter.all('/cron', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const bearer = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const token = bearer || req.query.token;
  if (!verifyCronToken(settings, token)) return res.status(401).json({ error: 'Invalid or missing research cron token.' });

  const jobs = [checkModelHealth({ narrativePreferred: settings.model?.trim() || undefined }).catch((err) => console.error('Model health check failed:', err))];
  if (settings.enabled) jobs.push(runCronBatch().catch((err) => console.error('Research cron batch failed:', err)));
  waitUntil(Promise.all(jobs));
  res.status(202).json({
    ok: true,
    accepted: true,
    research: settings.enabled ? `Refreshing up to ${settings.cron.batchSize} stale pairs.` : 'Fundamental Research is disabled.',
    models: 'AI model health check runs at most every 6 hours.',
  });
}));

researchRouter.use(requireAuth);

async function accessFor(userId, settings) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const role = user?.role ?? 'trader';
  const isAdmin = ADMIN_ROLES.includes(role);
  if (!settings.enabled && !isAdmin) return { allowed: false, isAdmin, reason: 'Fundamental Research is currently disabled by an administrator.' };
  if (settings.availability === 'premium' && !PREMIUM_ROLES.includes(role)) return { allowed: false, isAdmin, reason: 'Fundamental Research is available on Premium plans.' };
  return { allowed: true, isAdmin };
}

function startOfUtcDay() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function refreshesToday(userId) {
  return prisma.researchRun.count({ where: { userId, trigger: 'user', startedAt: { gte: startOfUtcDay() } } });
}

function subjectAllowed(parsed, settings) {
  if (!parsed) return false;
  if (parsed.kind === 'currency') return settings.currencies.includes(parsed.subject);
  return settings.pairs.includes(parsed.subject);
}

researchRouter.get('/config', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const access = await accessFor(req.userId, settings);
  res.json({
    settings: publicSettings(settings),
    access,
    currencies: settings.currencies.map((c) => ({ code: c, name: CURRENCIES[c].name, economy: CURRENCIES[c].economy, centralBank: CURRENCIES[c].centralBank.name })),
    usage: { refreshesToday: await refreshesToday(req.userId), limit: access.isAdmin ? null : settings.userRefreshLimitPerDay },
  });
}));

researchRouter.get('/:subject', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const access = await accessFor(req.userId, settings);
  if (!access.allowed) return res.status(403).json({ error: access.reason });
  const parsed = parseSubject(req.params.subject);
  if (!parsed) return res.status(404).json({ error: 'Unknown currency or pair.' });
  if (!subjectAllowed(parsed, settings) && !access.isAdmin) return res.status(404).json({ error: 'This instrument is not enabled for Fundamental Research.' });

  const [row, running, history] = await Promise.all([latestReport(parsed.kind, parsed.subject), activeRun(parsed.subject), reportHistory(parsed.kind, parsed.subject)]);
  res.json({
    subject: parsed.subject,
    kind: parsed.kind,
    report: row?.payload ?? null,
    reportId: row?.id ?? null,
    freshness: freshnessOf(row, settings),
    running: !!running,
    history,
  });
}));

// Streams NDJSON progress events. Serves the cached report unless it is stale
// (or an admin forces a refresh), so opening a page never triggers a full run.
researchRouter.post('/:subject/refresh', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const access = await accessFor(req.userId, settings);
  if (!access.allowed) return res.status(403).json({ error: access.reason });
  const parsed = parseSubject(req.params.subject);
  if (!parsed) return res.status(404).json({ error: 'Unknown currency or pair.' });
  if (!subjectAllowed(parsed, settings) && !access.isAdmin) return res.status(404).json({ error: 'This instrument is not enabled for Fundamental Research.' });

  const force = !!req.body?.force && access.isAdmin;
  const existing = await latestReport(parsed.kind, parsed.subject);
  const freshness = freshnessOf(existing, settings);
  if (existing && !freshness.stale && !force) {
    return res.json({ type: 'done', cached: true, report: existing.payload, freshness });
  }
  if (!access.isAdmin && (await refreshesToday(req.userId)) >= settings.userRefreshLimitPerDay) {
    return res.status(429).json({ error: `Daily research refresh limit reached (${settings.userRefreshLimitPerDay}). The cached report is still available.` });
  }
  if (await activeRun(parsed.subject)) return res.status(409).json({ error: 'in_progress', message: 'Research for this instrument is already running.' });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const write = (event) => res.write(`${JSON.stringify(event)}\n`);

  try {
    const row = await runResearch({
      subject: parsed.subject,
      trigger: access.isAdmin && force ? 'admin' : 'user',
      userId: req.userId,
      bypassCache: force && !!req.body?.bypassCache,
      onStep: write,
    });
    write({ type: 'done', cached: false, report: row.payload, freshness: freshnessOf(row, settings) });
  } catch (err) {
    const message = err instanceof ResearchError ? err.message : 'Research run failed. The previous report (if any) is still available.';
    if (!(err instanceof ResearchError)) console.error('Research run failed:', err);
    write({ type: 'error', code: err.code ?? 'failed', message });
  }
  res.end();
}));

researchRouter.get('/:subject/history', asyncHandler(async (req, res) => {
  const parsed = parseSubject(req.params.subject);
  if (!parsed) return res.status(404).json({ error: 'Unknown instrument.' });
  res.json({ history: await reportHistory(parsed.kind, parsed.subject, 120) });
}));
