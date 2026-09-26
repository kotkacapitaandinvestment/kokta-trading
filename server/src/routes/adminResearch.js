import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { CURRENCIES, SUPPORTED_CURRENCY_CODES, FACTORS } from '../lib/research/currencies.js';
import { loadSettings, sanitizeSettings, saveSettings, generateCronToken, saveCronToken, SOURCE_KEYS } from '../lib/research/settings.js';
import { getCronJobOrgKey, syncCronJob, getCronJobStatus, CRON_PATH } from '../lib/cronJobOrg.js';
import { cachedSource } from '../lib/research/cache.js';
import { latestReportSummaries, freshnessOf } from '../lib/research/engine.js';
import { RESEARCH_DEFAULT_MODEL } from '../lib/research/narrative.js';
import { purgeExpiredSourceCache } from '../lib/research/cache.js';

export const adminResearchRouter = Router();
adminResearchRouter.use(requireAuth, requireRole('admin', 'super_admin'));

const ASSESSMENT_FACTORS = ['valuation', 'imf_view', 'central_bank', 'fiscal', 'external', 'financial_stability', 'general'];
const VALUATION_CLASSES = ['SUBSTANTIALLY UNDERVALUED', 'MODERATELY UNDERVALUED', 'BROADLY IN LINE', 'MODERATELY OVERVALUED', 'SUBSTANTIALLY OVERVALUED'];

function adminView(settings) {
  const { cron, ...rest } = settings;
  return { ...rest, cron: { configured: !!cron.tokenHash, tokenHint: cron.tokenHint, batchSize: cron.batchSize, jobId: cron.jobId ?? null, rotatedAt: cron.rotatedAt ?? null } };
}

// Live status of the cron-job.org job (cached 15 min; the API allows ~100 calls/day).
async function cronJobView(settings, { fresh = false } = {}) {
  const { configured, apiKey } = await getCronJobOrgKey();
  if (!configured) return { managed: false };
  if (!apiKey) return { managed: true, jobId: settings.cron?.jobId ?? null, error: 'The cron-job.org API key in Integrations is empty or unreadable.' };
  if (!settings.cron?.jobId) return { managed: true, jobId: null };
  try {
    const { data } = await cachedSource(`cronjob:status:${settings.cron.jobId}`, 15 * 60 * 1000, () => getCronJobStatus(apiKey, settings.cron.jobId), { bypass: fresh });
    return { managed: true, jobId: settings.cron.jobId, status: data };
  } catch (err) {
    return { managed: true, jobId: settings.cron.jobId, error: err.message };
  }
}

function publicAppUrl(req) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `${req.get('x-forwarded-proto')?.split(',')[0] ?? req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
}

adminResearchRouter.get('/settings', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const nvidia = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  const fred = await prisma.integration.findUnique({ where: { provider: 'fred' } });
  res.json({
    settings: adminView(settings),
    cronJob: await cronJobView(settings),
    catalog: {
      currencies: SUPPORTED_CURRENCY_CODES.map((c) => ({
        code: c,
        name: CURRENCIES[c].name,
        centralBank: CURRENCIES[c].centralBank.name,
        coverage: CURRENCIES[c].centralBank.statement ? 'full' : 'core',
      })),
      sources: SOURCE_KEYS,
      factors: FACTORS,
      assessmentFactors: ASSESSMENT_FACTORS,
      valuationClasses: VALUATION_CLASSES,
      defaultModel: RESEARCH_DEFAULT_MODEL,
    },
    integrations: {
      nvidia: !!(nvidia?.enabled && nvidia?.secretCipher),
      fred: !!(fred?.enabled && fred?.secretCipher),
    },
  });
}));

adminResearchRouter.put('/settings', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const current = await loadSettings();
  const next = sanitizeSettings(req.body ?? {}, current);
  const saved = await saveSettings(next, req.userId);
  res.json({ settings: adminView(saved) });
}));

// Rotates the cron token. When a cron-job.org key is configured, the job is
// updated first and the new token is only saved if that succeeds, so the
// schedule and the token can never fall out of sync.
adminResearchRouter.post('/cron-token', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const token = generateCronToken();
  const url = `${publicAppUrl(req)}${CRON_PATH}`;
  const { configured, apiKey } = await getCronJobOrgKey();
  if (configured && !apiKey) {
    return res.status(409).json({ error: 'The cron-job.org API key in Integrations is empty or unreadable, so the job could not be updated. The token was not changed.' });
  }
  if (!configured && settings.cron.jobId) {
    return res.status(409).json({ error: `The current token is used by cron-job.org job #${settings.cron.jobId}. Add the cron-job.org API key in Integrations so the job can be updated; the token was not changed.` });
  }

  if (apiKey) {
    let sync;
    try {
      sync = await syncCronJob({ apiKey, jobId: settings.cron.jobId, url, token });
    } catch (err) {
      return res.status(502).json({ error: `cron-job.org could not be updated, so the token was not changed: ${err.message}` });
    }
    await saveCronToken(token, req.userId, { jobId: sync.jobId });
    const fresh = await loadSettings();
    return res.json({ managed: true, jobId: sync.jobId, created: sync.created, cronJob: await cronJobView(fresh, { fresh: true }) });
  }

  await saveCronToken(token, req.userId);
  res.json({ managed: false, token, url: `${url}?token=${token}`, header: `Authorization: Bearer ${token}` });
}));

adminResearchRouter.get('/status', asyncHandler(async (req, res) => {
  const settings = await loadSettings();
  const subjects = [...settings.pairs.map((p) => ['pair', p]), ...settings.currencies.map((c) => ['currency', c])];
  const latest = await latestReportSummaries();
  const reports = subjects.map(([kind, subject]) => {
    const row = latest.get(`${kind}:${subject}`) ?? null;
    return {
      kind,
      subject,
      score: row?.score ?? null,
      confidence: row?.confidence ?? null,
      condition: row?.condition ?? null,
      narrativeSource: row?.narrativeSource ?? null,
      freshness: freshnessOf(row, settings),
    };
  });
  const lastRun = await prisma.researchRun.findFirst({ where: { status: { in: ['succeeded', 'failed'] } }, orderBy: { startedAt: 'desc' } });
  const lastCron = await prisma.researchRun.findFirst({ where: { trigger: 'cron' }, orderBy: { startedAt: 'desc' } });
  res.json({ reports, sourceHealth: lastRun?.sourceStatus ?? [], sourceHealthAt: lastRun?.finishedAt ?? null, lastCronRunAt: lastCron?.startedAt ?? null });
}));

adminResearchRouter.get('/runs', asyncHandler(async (req, res) => {
  const runs = await prisma.researchRun.findMany({ orderBy: { startedAt: 'desc' }, take: 60 });
  const userIds = [...new Set(runs.map((r) => r.userId).filter(Boolean))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  res.json({
    runs: runs.map((r) => ({
      id: r.id,
      kind: r.kind,
      subject: r.subject,
      trigger: r.trigger,
      user: r.userId ? byId[r.userId] ?? null : null,
      status: r.status,
      error: r.error,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.finishedAt ? new Date(r.finishedAt) - new Date(r.startedAt) : null,
      failedSources: (r.sourceStatus ?? []).filter((s) => s.status === 'failed').map((s) => ({ name: s.name, error: s.error })),
    })),
  });
}));

adminResearchRouter.post('/cache/purge', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const removed = await purgeExpiredSourceCache();
  res.json({ removed });
}));

// ── Curated source assessments ────────────────────────────────────────────
function validateAssessment(body) {
  const currency = String(body.currency ?? '').toUpperCase();
  const factor = String(body.factor ?? '');
  const errors = [];
  if (!SUPPORTED_CURRENCY_CODES.includes(currency)) errors.push('Unsupported currency.');
  if (!ASSESSMENT_FACTORS.includes(factor)) errors.push('Unsupported factor.');
  if (!body.institution?.trim()) errors.push('Institution is required.');
  if (!body.title?.trim()) errors.push('Title is required.');
  if (!body.statement?.trim()) errors.push('The statement (quoted or closely summarised from the source) is required.');
  let url;
  try {
    url = new URL(body.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    errors.push('A valid source URL is required — Kotka never records an assessment without its original source.');
  }
  const publishedAt = new Date(body.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) errors.push('Publication date is required.');
  if (factor === 'valuation' && !VALUATION_CLASSES.includes(String(body.classification ?? '').toUpperCase())) errors.push('Valuation assessments need a classification.');
  return {
    errors,
    data: {
      currency,
      factor,
      institution: body.institution?.trim(),
      title: body.title?.trim(),
      classification: body.classification ? String(body.classification).toUpperCase() : null,
      statement: body.statement?.trim(),
      url: url?.toString(),
      publishedAt,
    },
  };
}

adminResearchRouter.get('/assessments', asyncHandler(async (req, res) => {
  const items = await prisma.sourceAssessment.findMany({ orderBy: [{ currency: 'asc' }, { publishedAt: 'desc' }] });
  res.json({ items });
}));

adminResearchRouter.post('/assessments', asyncHandler(async (req, res) => {
  const { errors, data } = validateAssessment(req.body ?? {});
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const item = await prisma.sourceAssessment.create({ data: { ...data, createdById: req.userId } });
  res.status(201).json({ item });
}));

adminResearchRouter.patch('/assessments/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.sourceAssessment.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Assessment not found.' });
  const { errors, data } = validateAssessment({ ...existing, ...req.body });
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const item = await prisma.sourceAssessment.update({ where: { id: existing.id }, data });
  res.json({ item });
}));

adminResearchRouter.delete('/assessments/:id', asyncHandler(async (req, res) => {
  await prisma.sourceAssessment.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
}));
