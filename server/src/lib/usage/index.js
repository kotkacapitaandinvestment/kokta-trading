// Kotka's usage engine: the one place that decides whether someone may use a
// metered feature, and the one ledger (UsageRecord) of what they used.
//
//   reserveUsage()  before the costly work: the feature switch, then the
//                   limits (day, week and month, for the feature and for the
//                   action; the most restrictive wins), then the request key,
//                   then a 'pending' row. It runs under a per-person,
//                   per-feature database lock, so parallel requests can't all
//                   slip under a limit.
//   settleUsage()   after the work: 'consumed' (counts), or 'released' /
//                   'failed' (doesn't). Awaited before the response ends; on
//                   serverless, work left running after the response may
//                   never finish.
//
// What counts:
//   - a refused request (over a limit, feature paused, too fast) never costs
//     a unit;
//   - work that failed at the provider or inside Kotka costs nothing;
//   - work answered from a cache costs nothing;
//   - a partial AI reply that reached the trader counts;
//   - a reservation that is never settled (the function was stopped) counts,
//     so an interrupted request is never a free one.
//
// Request keys stop double counting: a retried request with the same key
// (an Idempotency-Key header, or a view of the same thing within 15 minutes)
// is recognised instead of charged again.

import { prisma } from '../prisma.js';
import { asyncHandler } from '../asyncHandler.js';
import { FEATURES, FEATURE_KEYS, isAction, meterOf, actionLabel } from './registry.js';
import { PERIODS, REASON, periodBounds, resetPhrase } from './periods.js';
import { loadUsageConfig, isPaused, isExempt, effectiveLimits, windowStarts, hasAnyLimit } from './config.js';
import { currentUsageContext, withUsageContext } from './context.js';

export { withUsageContext } from './context.js';

export const COUNTED = ['pending', 'consumed', 'abandoned'];
const STALE_PENDING_MS = 10 * 60e3;
const MAX_UNITS = 1000;
export const VIEW_WINDOW_MS = 15 * 60e3;
const NO_LIMITS = { day: null, week: null, month: null };
const ZERO = { day: 0, week: 0, month: 0 };

async function roleOf(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role ?? 'trader';
}

// Counted units per action for one person and feature, per period.
async function countByAction(db, userId, feature, starts) {
  const earliest = new Date(Math.min(...PERIODS.map((p) => starts[p].getTime())));
  const rows = await db.$queryRaw`
    SELECT "action",
      COALESCE(SUM("units") FILTER (WHERE "createdAt" >= ${starts.day}), 0)::int AS "day",
      COALESCE(SUM("units") FILTER (WHERE "createdAt" >= ${starts.week}), 0)::int AS "week",
      COALESCE(SUM("units") FILTER (WHERE "createdAt" >= ${starts.month}), 0)::int AS "month"
    FROM "UsageRecord"
    WHERE "userId" = ${userId} AND "feature" = ${feature} AND "status" IN ('pending', 'consumed', 'abandoned') AND "createdAt" >= ${earliest}
    GROUP BY "action"`;
  return new Map(rows.map((r) => [r.action, { day: r.day, week: r.week, month: r.month }]));
}

const sumCounts = (byAction) => {
  const total = { ...ZERO };
  for (const c of byAction.values()) for (const p of PERIODS) total[p] += c[p];
  return total;
};

function periodsView(used, limits, bounds) {
  return Object.fromEntries(
    PERIODS.map((p) => [p, { used: used[p], limit: limits[p], remaining: limits[p] === null ? null : Math.max(0, limits[p] - used[p]), resetAt: bounds[p].resetAt.toISOString() }]),
  );
}

// The period that refuses `units` more, if any. When several do, the one
// that resets last is what the person is waiting for.
function blockingPeriod(used, limits, units, bounds) {
  let block = null;
  for (const p of PERIODS) {
    if (limits[p] !== null && used[p] + units > limits[p] && (!block || bounds[p].resetAt > bounds[block].resetAt)) block = p;
  }
  return block;
}

const WHICH = { day: 'today’s', week: 'this week’s', month: 'this month’s' };

export function limitMessage(feature, period, { action = null, now = new Date() } = {}) {
  const label = FEATURES[feature].label;
  const what = action ? `${label} limit for ${actionLabel(feature, action).toLowerCase()}` : `${label} limit`;
  return `You’ve reached ${WHICH[period]} ${what}. It resets ${resetPhrase(period, now)}.`;
}

export const pausedMessage = (feature) => `${FEATURES[feature].label} is temporarily unavailable. Please try again later.`;

export const DUPLICATE_REQUEST = { error: 'That request is already being handled. Refresh in a moment to see the result.', code: 'duplicate_request' };

// A key seen before: counted work is recognised (not charged again); a retry
// of something that didn't count frees the key and goes ahead as new.
async function findDuplicate(db, userId, requestKey) {
  const existing = await db.usageRecord.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
  if (!existing) return null;
  if (COUNTED.includes(existing.status)) return { ok: true, reservation: null, duplicate: existing, usage: null };
  await db.usageRecord.update({ where: { id: existing.id }, data: { requestKey: `${requestKey}#${existing.id}` } });
  return null;
}

// One 'blocked' row per person, meter and period window: enough to answer
// "how many people hit their limit" without a row per refused click.
async function recordBlocked(db, { userId, feature, action, meter, period, limit, used, bounds }) {
  const requestKey = `b:${meter}:${period}:${bounds[period].start.toISOString()}`;
  const seen = await db.usageRecord.findUnique({ where: { userId_requestKey: { userId, requestKey } }, select: { id: true } });
  if (seen) return;
  await db.usageRecord.create({ data: { userId, feature, action, units: 0, status: 'blocked', requestKey, settledAt: new Date(), metadata: { meter, period, limit, used } } });
}

/**
 * Reserve units before doing costly work. Returns:
 *   { ok: true, reservation, usage }            go ahead; settle `reservation` after
 *   { ok: true, reservation: null, duplicate }  this request key was already counted
 *   { ok: false, status, body }                 refused (paused 503, over a limit 429)
 */
export async function reserveUsage({ userId, feature, action, units = 1, requestKey = null, role, metadata = {} }) {
  if (typeof userId !== 'string' || !userId) throw new TypeError('Usage needs the signed-in user.');
  if (!isAction(feature, action)) throw new TypeError(`Unknown usage action: ${feature}.${action}`);
  if (!Number.isInteger(units) || units < 1 || units > MAX_UNITS) throw new RangeError(`Usage units must be a whole number from 1 to ${MAX_UNITS}.`);

  const now = new Date();
  const config = await loadUsageConfig();
  if (isPaused(config, feature)) return { ok: false, status: 503, body: { error: pausedMessage(feature), code: 'feature_paused', feature } };

  const exempt = isExempt(config, role ?? (await roleOf(userId)));
  const actionMeter = meterOf(feature, action);
  const limits = exempt ? null : await effectiveLimits(prisma, userId, [feature, actionMeter], config, now);
  const data = { userId, feature, action, units, status: 'pending', requestKey, metadata: exempt ? { ...metadata, exempt: true } : metadata };

  // Nothing to enforce: record the reservation without taking the lock.
  if (!limits || (!hasAnyLimit(limits[feature].limits) && !hasAnyLimit(limits[actionMeter].limits))) {
    if (requestKey) {
      const dup = await findDuplicate(prisma, userId, requestKey);
      if (dup) return dup;
    }
    try {
      const row = await prisma.usageRecord.create({ data });
      return { ok: true, reservation: row.id, usage: null, exempt };
    } catch (err) {
      // The same key arrived twice at once: the other request has it.
      if (err.code === 'P2002' && requestKey) return { ok: true, reservation: null, duplicate: { status: 'pending' }, usage: null };
      throw err;
    }
  }

  return prisma.$transaction(
    async (tx) => {
      // Serialises this person's reservations for this feature across every server instance.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kotka-usage:${userId}:${feature}`}))`;
      await tx.usageRecord.updateMany({ where: { userId, feature, status: 'pending', createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } }, data: { status: 'abandoned' } });
      if (requestKey) {
        const dup = await findDuplicate(tx, userId, requestKey);
        if (dup) return dup;
      }
      const starts = await windowStarts(tx, userId, feature, now);
      const byAction = await countByAction(tx, userId, feature, starts);
      const counts = { [feature]: sumCounts(byAction), [actionMeter]: byAction.get(action) ?? { ...ZERO } };
      const bounds = periodBounds(now);

      let block = null;
      for (const meter of [feature, actionMeter]) {
        const period = blockingPeriod(counts[meter], limits[meter].limits, units, bounds);
        if (period && (!block || bounds[period].resetAt > bounds[block.period].resetAt)) block = { meter, period };
      }
      if (block) {
        const { meter, period } = block;
        await recordBlocked(tx, { userId, feature, action, meter, period, limit: limits[meter].limits[period], used: counts[meter][period], bounds });
        return {
          ok: false,
          status: 429,
          body: {
            error: limitMessage(feature, period, { action: meter === actionMeter ? action : null, now }),
            code: 'usage_limit',
            feature,
            action,
            meter,
            // "Kotka AI", or "Kotka AI chart reading" for an action's own limit.
            limitName: meter === actionMeter ? `${FEATURES[feature].label} ${actionLabel(feature, action).toLowerCase()}` : FEATURES[feature].label,
            reason: REASON[period],
            period,
            resetAt: bounds[period].resetAt.toISOString(),
            usage: periodsView(counts[meter], limits[meter].limits, bounds),
          },
        };
      }

      const row = await tx.usageRecord.create({ data });
      const after = Object.fromEntries(PERIODS.map((p) => [p, counts[feature][p] + units]));
      return { ok: true, reservation: row.id, usage: periodsView(after, limits[feature].limits, bounds), exempt: false };
    },
    { maxWait: 15000, timeout: 20000 },
  );
}

/**
 * Settle a reservation. outcome: 'consumed' (counts), 'released' (nothing
 * costly happened) or 'failed' (the work failed). Model, tokens and upstream
 * calls come from the usage context the work ran in. Never throws.
 */
export async function settleUsage(reservation, outcome, { model, metadata } = {}) {
  if (!reservation) return;
  if (!['consumed', 'released', 'failed'].includes(outcome)) throw new TypeError(`Unknown usage outcome: ${outcome}`);
  const ctx = currentUsageContext();
  try {
    const row = await prisma.usageRecord.findUnique({ where: { id: reservation }, select: { createdAt: true, metadata: true } });
    if (!row) return;
    const meta = { ...(row.metadata ?? {}), ...(metadata ?? {}) };
    const data = { status: outcome, settledAt: new Date(), latencyMs: Math.min(Date.now() - row.createdAt.getTime(), 2 ** 31 - 1) };
    const providers = [];
    if (ctx) {
      if (ctx.modelCalls) {
        providers.push('nvidia');
        meta.modelCalls = ctx.modelCalls;
        if (ctx.models.length > 1) meta.models = ctx.models;
      }
      if (Object.keys(ctx.upstream).length) {
        meta.upstream = ctx.upstream;
        providers.push(...Object.keys(ctx.upstream));
      }
      if (ctx.cacheHits) meta.cacheHits = ctx.cacheHits;
      if (ctx.tokensReported) Object.assign(data, { inputTokens: ctx.inputTokens, outputTokens: ctx.outputTokens, totalTokens: ctx.totalTokens });
    }
    const usedModel = model ?? ctx?.models.at(-1);
    if (usedModel) data.model = String(usedModel).slice(0, 120);
    // Only providers that were actually called; a cached answer has none.
    if (providers.length) data.provider = [...new Set(providers)].join(', ').slice(0, 200);
    data.metadata = meta;
    await prisma.usageRecord.updateMany({ where: { id: reservation, status: { in: ['pending', 'abandoned'] } }, data });
  } catch (err) {
    console.error('Failed to settle usage:', err.message);
  }
}

// Status for the app: 'reached' when any limit is used up, 'warning' past
// the warning threshold, otherwise 'ok'.
function statusOf(views, warnAtPct) {
  let status = 'ok';
  for (const v of views) {
    for (const p of PERIODS) {
      const { used, limit } = v[p];
      if (limit === null) continue;
      if (used >= limit) return 'reached';
      if (limit > 0 && (used / limit) * 100 >= warnAtPct) status = 'warning';
    }
  }
  return status;
}

// The period with the fewest units left: what the app shows first.
function headline(periods) {
  let best = null;
  for (const p of PERIODS) {
    const v = periods[p];
    if (v.limit !== null && (!best || v.remaining < best.remaining)) best = { period: p, ...v };
  }
  return best;
}

/** What one person has used and may still use, per feature (for the app and admins). */
export async function usageSnapshot(userId, { role, features = FEATURE_KEYS } = {}) {
  const now = new Date();
  const config = await loadUsageConfig();
  const exempt = isExempt(config, role ?? (await roleOf(userId)));
  const bounds = periodBounds(now);
  return Promise.all(
    features.map(async (feature) => {
      const f = FEATURES[feature];
      const actionMeters = Object.keys(f.actions).map((a) => meterOf(feature, a));
      const [limits, starts] = await Promise.all([effectiveLimits(prisma, userId, [feature, ...actionMeters], config, now), windowStarts(prisma, userId, feature, now)]);
      const byAction = await countByAction(prisma, userId, feature, starts);
      const featureLimits = exempt ? NO_LIMITS : limits[feature].limits;
      const periods = periodsView(sumCounts(byAction), featureLimits, bounds);
      const actions = exempt
        ? []
        : Object.keys(f.actions)
            .filter((a) => hasAnyLimit(limits[meterOf(feature, a)].limits))
            .map((a) => {
              const view = periodsView(byAction.get(a) ?? ZERO, limits[meterOf(feature, a)].limits, bounds);
              return { action: a, label: f.actions[a], periods: view, headline: headline(view) };
            });
      const warnAtPct = limits[feature].warnAtPct;
      return {
        feature,
        label: f.label,
        unit: f.unit,
        paused: isPaused(config, feature),
        exempt,
        limited: hasAnyLimit(featureLimits) || actions.length > 0,
        source: exempt ? 'exempt' : limits[feature].source,
        overrideExpiresAt: limits[feature].expiresAt ?? null,
        warnAtPct,
        periods,
        headline: headline(periods),
        actions,
        status: statusOf([periods, ...actions.map((a) => a.periods)], warnAtPct),
      };
    }),
  );
}

// ── Express helpers ───────────────────────────────────────────────────────

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

// An Idempotency-Key header, namespaced so it can't collide with other keys.
export function clientRequestKey(req, feature, action) {
  const key = req.get('idempotency-key');
  return key && KEY_RE.test(key) ? `k:${feature}.${action}:${key}` : null;
}

// Reloading a view of the same thing within 15 minutes counts once.
export function viewRequestKey(action, subject = '', at = Date.now()) {
  return `v:${action}:${String(subject).slice(0, 80)}:${Math.floor(at / VIEW_WINDOW_MS)}`;
}

const FREE = Symbol('usage.free');
// Wrap a handler's result when nothing costly happened (e.g. the data source
// isn't set up), so the view isn't charged.
export const free = (payload) => ({ [FREE]: payload });

/**
 * A metered JSON route: reserve, run, settle, respond. The handler returns
 * the response body, free(body) when nothing costly happened, or undefined
 * when it already responded itself (not charged).
 */
export function metered(feature, action, handler, { view } = {}) {
  return asyncHandler((req, res) =>
    withUsageContext(async () => {
      const requestKey = view ? viewRequestKey(action, view(req)) : clientRequestKey(req, feature, action);
      const r = await reserveUsage({ userId: req.userId, feature, action, requestKey, role: req.userRole });
      if (!r.ok) return res.status(r.status).json(r.body);
      if (!r.reservation && !view) return res.status(409).json(DUPLICATE_REQUEST);
      let result;
      try {
        result = await handler(req, res);
      } catch (err) {
        await settleUsage(r.reservation, 'failed');
        throw err;
      }
      const charged = result !== undefined && !(result && result[FREE] !== undefined);
      await settleUsage(r.reservation, charged ? 'consumed' : 'released');
      if (!res.headersSent) res.json(result?.[FREE] ?? result);
    }),
  );
}
