import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { audit } from '../lib/audit.js';
import { loadAppSettings, saveAppSettings } from '../lib/appSettings.js';
import { FEATURES, FEATURE_KEYS, parseMeter, meterLabel } from '../lib/usage/registry.js';
import { PERIODS, LIMIT_FIELD } from '../lib/usage/periods.js';
import { DEFAULT_SCOPE, clearUsageConfigCache } from '../lib/usage/config.js';
import { usageOverview, featureBreakdown, userUsageDetail, usageRecords } from '../lib/usage/admin.js';

// Usage Control. Mounted behind requireAuth + requireRole('admin', 'super_admin').
// Admins can look at everything, pause a feature in an emergency, give
// someone their own limit and reset someone's usage. Changing the default
// limits and settings is for super admins. Every change is in the Audit Log.
export const adminUsageRouter = Router();

const superAdminOnly = (req, res, next) => (req.user.role === 'super_admin' ? next() : res.status(403).json({ error: 'Only a super admin can change default limits and settings.' }));

const STATUSES = ['pending', 'consumed', 'abandoned', 'released', 'failed', 'blocked'];
const MAX_LIMIT = 1_000_000;
const LIMIT_ERROR = `Limits are whole numbers from 0 to ${MAX_LIMIT.toLocaleString('en')}. Leave a box empty for no limit.`;

// undefined = not sent (keep what's there); '' or null = no limit.
function limitValue(v) {
  if (v === undefined) return { keep: true };
  if (v === null || v === '') return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_LIMIT) return { error: LIMIT_ERROR };
  return { value: n };
}

function readLimits(body, current = {}) {
  const out = {};
  for (const p of PERIODS) {
    const field = LIMIT_FIELD[p];
    const r = limitValue(body?.[field]);
    if (r.error) return { error: r.error };
    out[field] = r.keep ? current[field] ?? null : r.value;
  }
  return { limits: out };
}

function readDate(v, label) {
  if (v === undefined || v === null || v === '') return { value: null };
  const d = new Date(v);
  if (typeof v !== 'string' || Number.isNaN(d.getTime())) return { error: `${label} isn’t a date we understand.` };
  return { value: d };
}

const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function namesFor(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  return new Map((await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
}

function limitView(row, names) {
  const m = parseMeter(row.meter);
  return {
    meter: row.meter,
    label: meterLabel(row.meter),
    feature: m?.feature ?? null,
    action: m?.action ?? null,
    daily: row.daily,
    weekly: row.weekly,
    monthly: row.monthly,
    enabled: row.enabled,
    warnAtPct: row.warnAtPct,
    updatedAt: row.updatedAt,
    updatedByName: names.get(row.updatedBy) ?? null,
  };
}

adminUsageRouter.get('/overview', asyncHandler(async (req, res) => {
  res.json(await usageOverview());
}));

// Features, their actions, default limits, emergency switches and settings.
adminUsageRouter.get('/config', asyncHandler(async (req, res) => {
  const [limits, controls, app] = await Promise.all([prisma.usageLimit.findMany({ where: { scope: DEFAULT_SCOPE }, orderBy: { meter: 'asc' } }), prisma.featureControl.findMany(), loadAppSettings()]);
  const names = await namesFor([...limits.map((l) => l.updatedBy), ...controls.map((c) => c.updatedBy)]);
  const control = new Map(controls.map((c) => [c.feature, c]));
  res.json({
    features: FEATURE_KEYS.map((feature) => {
      const c = control.get(feature);
      return {
        feature,
        label: FEATURES[feature].label,
        unit: FEATURES[feature].unit,
        actions: Object.entries(FEATURES[feature].actions).map(([action, label]) => ({ action, label, meter: `${feature}.${action}` })),
        paused: c?.enabled === false,
        pauseNote: c?.note ?? null,
        switchedAt: c?.updatedAt ?? null,
        switchedByName: names.get(c?.updatedBy) ?? null,
      };
    }),
    limits: limits.filter((l) => parseMeter(l.meter)).map((l) => limitView(l, names)),
    settings: { staffExempt: app.usageStaffExempt !== false, timezone: 'UTC' },
    canEditLimits: req.user.role === 'super_admin',
  });
}));

// Create or change the default limit for a feature or one action.
adminUsageRouter.put('/limits/:meter', superAdminOnly, asyncHandler(async (req, res) => {
  const meter = parseMeter(req.params.meter);
  if (!meter) return res.status(400).json({ error: 'Choose a feature or action from the list.' });
  const key = req.params.meter;
  const current = await prisma.usageLimit.findUnique({ where: { scope_meter: { scope: DEFAULT_SCOPE, meter: key } } });
  const { limits, error } = readLimits(req.body, current ?? {});
  if (error) return res.status(400).json({ error });
  const body = req.body ?? {};
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return res.status(400).json({ error: 'Choose whether the limit is on or off.' });
  let warnAtPct = current?.warnAtPct ?? 80;
  if (body.warnAtPct !== undefined) {
    warnAtPct = Number(body.warnAtPct);
    if (!Number.isInteger(warnAtPct) || warnAtPct < 1 || warnAtPct > 100) return res.status(400).json({ error: 'The warning point is a percentage from 1 to 100.' });
  }
  const data = { ...limits, enabled: body.enabled ?? current?.enabled ?? true, warnAtPct, updatedBy: req.user.id };
  const row = await prisma.usageLimit.upsert({ where: { scope_meter: { scope: DEFAULT_SCOPE, meter: key } }, update: data, create: { scope: DEFAULT_SCOPE, meter: key, ...data } });
  clearUsageConfigCache();
  const fields = ['daily', 'weekly', 'monthly', 'enabled', 'warnAtPct'];
  const changes = Object.fromEntries(fields.filter((f) => (current?.[f] ?? null) !== row[f]).map((f) => [f, { from: current?.[f] ?? null, to: row[f] }]));
  if (!current || Object.keys(changes).length) {
    await audit(req, current ? 'usage.limit_updated' : 'usage.limit_created', { targetType: 'usage_limit', targetId: key, detail: { meter: key, label: meterLabel(key), ...(current ? { changes } : { daily: row.daily, weekly: row.weekly, monthly: row.monthly, enabled: row.enabled, warnAtPct: row.warnAtPct }) } });
  }
  res.json({ limit: limitView(row, new Map([[req.user.id, req.user.name]])) });
}));

// Remove an action's own limit (the feature's limit still applies). A
// feature's limit can't be removed, only switched off or emptied.
adminUsageRouter.delete('/limits/:meter', superAdminOnly, asyncHandler(async (req, res) => {
  const meter = parseMeter(req.params.meter);
  if (!meter?.action) return res.status(400).json({ error: 'A feature’s limit can’t be removed. Switch it off or leave its boxes empty instead.' });
  const removed = await prisma.usageLimit.delete({ where: { scope_meter: { scope: DEFAULT_SCOPE, meter: req.params.meter } } }).catch(() => null);
  if (!removed) return res.status(404).json({ error: 'There’s no limit for that action.' });
  clearUsageConfigCache();
  await audit(req, 'usage.limit_removed', { targetType: 'usage_limit', targetId: req.params.meter, detail: { meter: req.params.meter, label: meterLabel(req.params.meter), daily: removed.daily, weekly: removed.weekly, monthly: removed.monthly } });
  res.json({ ok: true });
}));

// Emergency switch: pause or resume a whole feature for everyone.
adminUsageRouter.put('/features/:feature', asyncHandler(async (req, res) => {
  const feature = req.params.feature;
  if (!FEATURES[feature]) return res.status(404).json({ error: 'Choose a feature from the list.' });
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Choose whether the feature is available or paused.' });
  const note = cleanText(req.body.note, 200) || null;
  const before = await prisma.featureControl.findUnique({ where: { feature } });
  const row = await prisma.featureControl.upsert({ where: { feature }, update: { enabled: req.body.enabled, note, updatedBy: req.user.id }, create: { feature, enabled: req.body.enabled, note, updatedBy: req.user.id } });
  clearUsageConfigCache();
  if ((before?.enabled ?? true) !== row.enabled) {
    await audit(req, row.enabled ? 'usage.feature_resumed' : 'usage.feature_paused', { targetType: 'feature', targetId: feature, detail: { feature, label: FEATURES[feature].label, note } });
  }
  res.json({ feature, paused: !row.enabled, pauseNote: row.note });
}));

adminUsageRouter.put('/settings', superAdminOnly, asyncHandler(async (req, res) => {
  if (typeof req.body?.staffExempt !== 'boolean') return res.status(400).json({ error: 'Choose whether staff are held to usage limits.' });
  const current = await loadAppSettings();
  if (current.usageStaffExempt !== req.body.staffExempt) {
    await saveAppSettings({ ...current, usageStaffExempt: req.body.staffExempt }, req.user.id);
    await audit(req, 'usage.settings_updated', { targetType: 'app_settings', targetId: 'singleton', detail: { usageStaffExempt: { from: current.usageStaffExempt, to: req.body.staffExempt } } });
  }
  res.json({ settings: { staffExempt: req.body.staffExempt, timezone: 'UTC' } });
}));

adminUsageRouter.get('/features/:feature/breakdown', asyncHandler(async (req, res) => {
  if (!FEATURES[req.params.feature]) return res.status(404).json({ error: 'Choose a feature from the list.' });
  res.json(await featureBreakdown(req.params.feature));
}));

// Find someone by name, email or username.
adminUsageRouter.get('/users', asyncHandler(async (req, res) => {
  const q = cleanText(req.query.q, 100);
  if (q.length < 2) return res.json({ users: [] });
  const users = await prisma.user.findMany({
    where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, name: true, email: true, username: true, role: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  res.json({ users });
}));

adminUsageRouter.get('/users/:id', asyncHandler(async (req, res) => {
  const detail = await userUsageDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'We couldn’t find that person.' });
  res.json(detail);
}));

// Give someone their own limits for a feature or action. They replace the
// default while active; an earlier override for the same thing ends.
adminUsageRouter.post('/users/:id/overrides', asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } });
  if (!target) return res.status(404).json({ error: 'We couldn’t find that person.' });
  const body = req.body ?? {};
  const meter = parseMeter(body.meter);
  if (!meter) return res.status(400).json({ error: 'Choose a feature or action from the list.' });
  const { limits, error } = readLimits({ daily: body.daily ?? null, weekly: body.weekly ?? null, monthly: body.monthly ?? null });
  if (error) return res.status(400).json({ error });
  const starts = readDate(body.startsAt, 'The start date');
  const expires = readDate(body.expiresAt, 'The end date');
  if (starts.error || expires.error) return res.status(400).json({ error: starts.error ?? expires.error });
  const startsAt = starts.value ?? new Date();
  if (expires.value && expires.value <= new Date(Math.max(startsAt.getTime(), Date.now()))) return res.status(400).json({ error: 'The end date has to be after the start date and in the future.' });
  const reason = cleanText(body.reason, 300);
  if (reason.length < 3) return res.status(400).json({ error: 'Add a short reason, for example “beta tester” or “staff account”.' });

  const now = new Date();
  const [ended, override] = await prisma.$transaction([
    prisma.usageOverride.updateMany({ where: { userId: target.id, meter: body.meter, endedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, data: { endedAt: now } }),
    prisma.usageOverride.create({ data: { userId: target.id, meter: body.meter, ...limits, startsAt, expiresAt: expires.value, reason, createdBy: req.user.id } }),
  ]);
  await audit(req, 'usage.override_created', {
    targetType: 'user',
    targetId: target.id,
    detail: { meter: body.meter, label: meterLabel(body.meter), ...limits, startsAt, expiresAt: expires.value, reason, replacedEarlier: ended.count > 0 },
  });
  res.status(201).json({ override });
}));

adminUsageRouter.patch('/overrides/:id', asyncHandler(async (req, res) => {
  const current = await prisma.usageOverride.findUnique({ where: { id: req.params.id } });
  if (!current || current.endedAt) return res.status(404).json({ error: 'That override has ended or doesn’t exist.' });
  const body = req.body ?? {};
  const { limits, error } = readLimits(body, current);
  if (error) return res.status(400).json({ error });
  const data = { ...limits };
  if (body.expiresAt !== undefined) {
    const expires = readDate(body.expiresAt, 'The end date');
    if (expires.error) return res.status(400).json({ error: expires.error });
    if (expires.value && expires.value <= new Date(Math.max(current.startsAt.getTime(), Date.now()))) return res.status(400).json({ error: 'The end date has to be after the start date and in the future.' });
    data.expiresAt = expires.value;
  }
  if (body.reason !== undefined) {
    const reason = cleanText(body.reason, 300);
    if (reason.length < 3) return res.status(400).json({ error: 'Add a short reason, for example “beta tester” or “staff account”.' });
    data.reason = reason;
  }
  const override = await prisma.usageOverride.update({ where: { id: current.id }, data });
  const changes = Object.fromEntries(Object.keys(data).filter((k) => String(current[k] ?? '') !== String(override[k] ?? '')).map((k) => [k, { from: current[k] ?? null, to: override[k] ?? null }]));
  if (Object.keys(changes).length) await audit(req, 'usage.override_updated', { targetType: 'user', targetId: current.userId, detail: { meter: current.meter, label: meterLabel(current.meter), changes } });
  res.json({ override });
}));

adminUsageRouter.post('/overrides/:id/end', asyncHandler(async (req, res) => {
  const current = await prisma.usageOverride.findUnique({ where: { id: req.params.id } });
  if (!current || current.endedAt) return res.status(404).json({ error: 'That override has ended or doesn’t exist.' });
  const override = await prisma.usageOverride.update({ where: { id: current.id }, data: { endedAt: new Date() } });
  await audit(req, 'usage.override_ended', { targetType: 'user', targetId: current.userId, detail: { meter: current.meter, label: meterLabel(current.meter), reason: current.reason } });
  res.json({ override });
}));

// Start someone's count again for one feature and period. The ledger is
// untouched; counting simply starts from now. A week reset also resets the
// day, a month reset all three.
adminUsageRouter.post('/users/:id/reset', asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'We couldn’t find that person.' });
  const feature = req.body?.feature;
  const period = req.body?.period;
  if (!FEATURES[feature]) return res.status(400).json({ error: 'Choose a feature from the list.' });
  if (!PERIODS.includes(period)) return res.status(400).json({ error: 'Choose today, this week or this month.' });
  const reason = cleanText(req.body?.reason, 300) || null;
  const reset = await prisma.usageReset.create({ data: { userId: target.id, feature, period, reason, createdBy: req.user.id } });
  await audit(req, 'usage.reset', { targetType: 'user', targetId: target.id, detail: { feature, label: FEATURES[feature].label, period, reason } });
  res.status(201).json({ reset });
}));

adminUsageRouter.get('/records', asyncHandler(async (req, res) => {
  const q = req.query;
  if (q.feature && !FEATURES[q.feature]) return res.status(400).json({ error: 'Choose a feature from the list.' });
  if (q.status && !STATUSES.includes(q.status)) return res.status(400).json({ error: 'Choose a status from the list.' });
  const from = readDate(q.from, 'The start date');
  const to = readDate(q.to, 'The end date');
  if (from.error || to.error) return res.status(400).json({ error: from.error ?? to.error });
  res.json(
    await usageRecords({
      userId: typeof q.userId === 'string' && q.userId ? q.userId : undefined,
      feature: q.feature || undefined,
      action: typeof q.action === 'string' && q.action ? q.action.slice(0, 60) : undefined,
      status: q.status || undefined,
      from: from.value ?? undefined,
      to: to.value ?? undefined,
      cursor: typeof q.cursor === 'string' && q.cursor ? q.cursor : undefined,
    }),
  );
}));
