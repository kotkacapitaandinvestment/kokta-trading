import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { CURRENCIES, parseSubject } from '../lib/research/currencies.js';
import { loadSettings, publicSettings, verifyCronToken } from '../lib/research/settings.js';
import { latestReport, freshnessOf, activeRun, runResearch, reportHistory, runCronBatch, ResearchError } from '../lib/research/engine.js';
import { checkModelHealth } from '../lib/aiModels.js';
import { loadAppSettings, paidFeatureLocked } from '../lib/appSettings.js';
import { reserveUsage, settleUsage, usageSnapshot, withUsageContext, clientRequestKey, metered, DUPLICATE_REQUEST } from '../lib/usage/index.js';
import { warmInstrumentBars } from '../lib/marketPulse.js';
import { runCommunityJobs } from '../lib/community/jobs.js';
import { sweep as sweepGameMatches } from '../lib/game/matches.js';
import { cryptoContext, CRYPTO } from '../lib/research/crypto.js';
import { instrument } from '../lib/instruments.js';

export const researchRouter = Router();

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
  // Price bars first (a few per run, within Massive's 5/min), then research,
  // which reuses the same cached bars for its pairs.
  const warm = warmInstrumentBars({ max: 4 }).catch((err) => console.error('Instrument bar warm-up failed:', err));
  if (settings.enabled) jobs.push(warm.then(() => runCronBatch()).catch((err) => console.error('Research cron batch failed:', err)));
  else jobs.push(warm);
  jobs.push(runCommunityJobs().catch((err) => console.error('Community jobs failed:', err)));
  // Trading Game: expire, start and settle anything that's due.
  jobs.push(sweepGameMatches().catch((err) => console.error('Game sweep failed:', err)));
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
  // "Premium only" has no effect until paid plans are switched on.
  if (settings.availability === 'premium' && paidFeatureLocked(role, await loadAppSettings())) {
    return { allowed: false, isAdmin, reason: 'Fundamental Research is available on Premium plans.' };
  }
  return { allowed: true, isAdmin };
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
    // Crypto has no issuing economy, so it gets a data context, not a score.
    crypto: Object.keys(CRYPTO).map((s) => ({ symbol: s, display: instrument(s).display, name: instrument(s).name })),
    usage: await researchUsage(req),
  });
}));

// Report updates used and left (Usage Control). refreshesToday/limit: the
// older app's fields, for copies still open in a browser.
async function researchUsage(req) {
  const [u] = await usageSnapshot(req.userId, { role: req.userRole, features: ['fundamental_research'] });
  return { ...u, refreshesToday: u.periods.day.used, limit: u.periods.day.limit };
}

// The crypto overview is a Market Intelligence view (one per pair, counted
// once per 15 minutes). Access and coverage are checked before counting.
researchRouter.get(
  '/crypto/:symbol',
  asyncHandler(async (req, res, next) => {
    const access = await accessFor(req.userId, await loadSettings());
    if (!access.allowed) return res.status(403).json({ error: access.reason });
    const inst = instrument(req.params.symbol);
    if (!inst || !CRYPTO[inst.symbol]) return res.status(404).json({ error: 'We don’t cover that crypto pair yet.' });
    req.cryptoSymbol = inst.symbol;
    next();
  }),
  metered('market_intelligence', 'crypto_context', (req) => cryptoContext(req.cryptoSymbol), { view: (req) => req.cryptoSymbol }),
);

researchRouter.get('/:subject', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const access = await accessFor(req.userId, settings);
  if (!access.allowed) return res.status(403).json({ error: access.reason });
  const parsed = parseSubject(req.params.subject);
  if (!parsed) return res.status(404).json({ error: 'We don’t cover that currency or pair yet.' });
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
// Only a run that actually happens is a Fundamental Research report update;
// a cached answer, a refused request and a failed run cost nothing.
researchRouter.post('/:subject/refresh', asyncHandler((req, res) => withUsageContext(() => refreshReport(req, res))));

async function refreshReport(req, res) {
  const settings = await loadSettings();
  const access = await accessFor(req.userId, settings);
  if (!access.allowed) return res.status(403).json({ error: access.reason });
  const parsed = parseSubject(req.params.subject);
  if (!parsed) return res.status(404).json({ error: 'We don’t cover that currency or pair yet.' });
  if (!subjectAllowed(parsed, settings) && !access.isAdmin) return res.status(404).json({ error: 'This instrument is not enabled for Fundamental Research.' });

  const force = !!req.body?.force && access.isAdmin;
  const existing = await latestReport(parsed.kind, parsed.subject);
  const freshness = freshnessOf(existing, settings);
  if (existing && !freshness.stale && !force) {
    return res.json({ type: 'done', cached: true, report: existing.payload, freshness });
  }
  if (await activeRun(parsed.subject)) return res.status(409).json({ error: 'in_progress', message: 'Research for this instrument is already running.' });
  const usage = await reserveUsage({ userId: req.userId, feature: 'fundamental_research', action: 'report_update', requestKey: clientRequestKey(req, 'fundamental_research', 'report_update'), role: req.userRole, metadata: { subject: parsed.subject } });
  if (!usage.ok) return res.status(usage.status).json({ ...usage.body, error: `${usage.body.error} You can still read the last saved report.` });
  if (!usage.reservation) return res.status(409).json(DUPLICATE_REQUEST);

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
    await settleUsage(usage.reservation, 'consumed');
    write({ type: 'done', cached: false, report: row.payload, freshness: freshnessOf(row, settings) });
  } catch (err) {
    await settleUsage(usage.reservation, 'failed', { metadata: { error: err.code ?? 'failed' } });
    const message = err instanceof ResearchError ? err.message : 'Research run failed. The previous report (if any) is still available.';
    if (!(err instanceof ResearchError)) console.error('Research run failed:', err);
    write({ type: 'error', code: err.code ?? 'failed', message });
  }
  res.end();
}

researchRouter.get('/:subject/history', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const access = await accessFor(req.userId, settings);
  if (!access.allowed) return res.status(403).json({ error: access.reason });
  const parsed = parseSubject(req.params.subject);
  if (!parsed) return res.status(404).json({ error: 'We don’t cover that market yet.' });
  res.json({ history: await reportHistory(parsed.kind, parsed.subject, 120) });
}));
