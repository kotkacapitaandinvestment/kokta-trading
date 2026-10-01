// Operations: error reports from the app, the public status page, the
// status probe the uptime schedule calls, and error review for admins.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { memoryLimit } from '../lib/rateLimit.js';
import { sessionUserId } from '../middleware/auth.js';
import { recordError, errorGroupView } from '../lib/ops/errors.js';
import { statusPage, recordStatusSample } from '../lib/ops/status.js';
import { loadSettings, verifyCronToken } from '../lib/research/settings.js';

export const opsRouter = Router();
export const adminErrorsRouter = Router();

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// Errors from people's browsers. Signed-in or not (the landing page counts
// too); a few per request, capped per network.
opsRouter.post('/telemetry/errors', memoryLimit('telemetry', 30, 60e3), asyncHandler(async (req, res) => {
  const list = Array.isArray(req.body?.errors) ? req.body.errors.slice(0, 5) : [];
  const s = req.body?.sample ?? {};
  const sample = { browser: str(s.browser, 80), screen: str(s.screen, 20), standalone: s.standalone === true };
  const userId = sessionUserId(req);
  for (const e of list) {
    if (!e || typeof e.message !== 'string') continue;
    await recordError({ source: 'client', message: e.message, stack: str(e.stack, 8000), path: str(e.path, 300), release: str(e.release, 40) || null, userId, sample });
  }
  res.status(204).end();
}));

// The public status page's data.
opsRouter.get('/status', memoryLimit('status', 60, 60e3), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await statusPage());
}));

// Called by the uptime schedule every few minutes (the same token as the
// hourly update). Records one sample for the status history.
opsRouter.all('/status/probe', asyncHandler(async (req, res) => {
  const bearer = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!verifyCronToken(await loadSettings(), bearer || req.query.token)) return res.status(401).json({ error: 'Invalid or missing token.' });
  const checks = await recordStatusSample();
  const down = Object.entries(checks).filter(([, v]) => v === 'down').map(([k]) => k);
  // A failing status tells the schedule something is down, so it can email.
  res.status(down.length ? 503 : 200).json({ ok: !down.length, down });
}));

// ── Admin: review errors ────────────────────────────────────────────────────

adminErrorsRouter.get('/', asyncHandler(async (req, res) => {
  const status = ['open', 'resolved', 'muted'].includes(req.query.status) ? req.query.status : 'open';
  const [groups, counts] = await Promise.all([
    prisma.errorGroup.findMany({ where: { status }, orderBy: { lastSeenAt: 'desc' }, take: 100 }),
    prisma.errorGroup.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({ errors: groups.map((g) => errorGroupView(g)), counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
}));

adminErrorsRouter.get('/:id', asyncHandler(async (req, res) => {
  const g = await prisma.errorGroup.findUnique({ where: { id: req.params.id } });
  if (!g) return res.status(404).json({ error: 'That error isn’t recorded any more.' });
  res.json({ error: errorGroupView(g, { withStack: true }) });
}));

adminErrorsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const status = req.body?.status;
  if (!['open', 'resolved', 'muted'].includes(status)) return res.status(400).json({ error: 'Choose open, resolved or muted.' });
  const g = await prisma.errorGroup.update({ where: { id: req.params.id }, data: { status, ...(status === 'open' ? { alertedAt: null } : {}) } }).catch(() => null);
  if (!g) return res.status(404).json({ error: 'That error isn’t recorded any more.' });
  res.json({ error: errorGroupView(g) });
}));
