// Where limits come from, most specific first:
//   1. an active UsageOverride for this person and meter (replaces the default)
//   2. the default UsageLimit for the meter (scope "default"), if switched on
//   3. nothing: counted, but no limit
// Defaults and feature switches are cached for 15 seconds per instance (and
// cleared on every admin change here); overrides and resets are read fresh,
// so a change for one person applies to their next request.

import { prisma } from '../prisma.js';
import { loadAppSettings, ADMIN_ROLES } from '../appSettings.js';
import { PERIODS, LIMIT_FIELD, periodStart, RESETS_THAT_APPLY } from './periods.js';

export const DEFAULT_SCOPE = 'default';
const CACHE_TTL_MS = 15 * 1000;
let cache = null;

export async function loadUsageConfig() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const [limits, controls, app] = await Promise.all([
    prisma.usageLimit.findMany({ where: { scope: DEFAULT_SCOPE } }),
    prisma.featureControl.findMany(),
    loadAppSettings(),
  ]);
  const value = {
    limits: new Map(limits.map((l) => [l.meter, l])),
    controls: new Map(controls.map((c) => [c.feature, c])),
    staffExempt: app.usageStaffExempt !== false,
  };
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

export function clearUsageConfigCache() {
  cache = null;
}

export const isPaused = (config, feature) => config.controls.get(feature)?.enabled === false;
export const isExempt = (config, role) => config.staffExempt && ADMIN_ROLES.includes(role);

const pick = (row) => Object.fromEntries(PERIODS.map((p) => [p, row[LIMIT_FIELD[p]] ?? null]));
export const hasAnyLimit = (limits) => !!limits && PERIODS.some((p) => limits[p] !== null);

export function activeOverrideWhere(userId, meters, now = new Date()) {
  return { userId, meter: { in: meters }, endedAt: null, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

// Effective limits for each meter: { [meter]: { limits: {day, week, month}, source, overrideId, warnAtPct } }.
export async function effectiveLimits(db, userId, meters, config, now = new Date()) {
  const overrides = await db.usageOverride.findMany({ where: activeOverrideWhere(userId, meters, now), orderBy: { createdAt: 'desc' } });
  const out = {};
  for (const meter of meters) {
    const row = config.limits.get(meter);
    const warnAtPct = row?.warnAtPct ?? config.limits.get(meter.split('.')[0])?.warnAtPct ?? 80;
    const override = overrides.find((o) => o.meter === meter);
    if (override) out[meter] = { limits: pick(override), source: 'override', overrideId: override.id, expiresAt: override.expiresAt, warnAtPct };
    else if (row?.enabled) out[meter] = { limits: pick(row), source: 'default', overrideId: null, warnAtPct: row.warnAtPct };
    else out[meter] = { limits: { day: null, week: null, month: null }, source: row ? 'off' : 'none', overrideId: null, warnAtPct };
  }
  return out;
}

// Where counting starts for each period: the period's start, or a later
// admin reset that covers it.
export async function windowStarts(db, userId, feature, now = new Date()) {
  const starts = Object.fromEntries(PERIODS.map((p) => [p, periodStart(p, now)]));
  const earliest = new Date(Math.min(...Object.values(starts).map((d) => d.getTime())));
  const resets = await db.usageReset.findMany({ where: { userId, feature, createdAt: { gte: earliest } }, select: { period: true, createdAt: true } });
  for (const p of PERIODS) {
    for (const r of resets) {
      if (RESETS_THAT_APPLY[p].includes(r.period) && r.createdAt > starts[p]) starts[p] = r.createdAt;
    }
  }
  return starts;
}
