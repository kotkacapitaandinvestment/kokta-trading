// Usage Control for admins: totals, breakdowns, who is near or at a limit,
// and the raw ledger. Every figure is read from UsageRecord; nothing is
// estimated or filled in.

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { FEATURES, FEATURE_KEYS, meterOf, actionLabel } from './registry.js';
import { PERIODS, LIMIT_FIELD, periodBounds } from './periods.js';
import { loadUsageConfig, isExempt, hasAnyLimit } from './config.js';
import { usageSnapshot } from './index.js';

const COUNTED_SQL = Prisma.sql`('pending', 'consumed', 'abandoned')`;
const DAY_MS = 86400e3;

function starts(now = new Date()) {
  const b = periodBounds(now);
  return { day: b.day.start, week: b.week.start, month: b.month.start, earliest: new Date(Math.min(b.week.start, b.month.start)) };
}

// Per feature: units and active people this day/week/month, people who hit
// each kind of limit, and how many requests failed or cost nothing.
export async function usageOverview() {
  const s = starts();
  const rows = await prisma.$queryRaw`
    SELECT "feature",
      COALESCE(SUM("units") FILTER (WHERE "status" IN ${COUNTED_SQL} AND "createdAt" >= ${s.day}), 0)::int AS "unitsDay",
      COALESCE(SUM("units") FILTER (WHERE "status" IN ${COUNTED_SQL} AND "createdAt" >= ${s.week}), 0)::int AS "unitsWeek",
      COALESCE(SUM("units") FILTER (WHERE "status" IN ${COUNTED_SQL} AND "createdAt" >= ${s.month}), 0)::int AS "unitsMonth",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" IN ${COUNTED_SQL} AND "createdAt" >= ${s.day})::int AS "usersDay",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" IN ${COUNTED_SQL} AND "createdAt" >= ${s.week})::int AS "usersWeek",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" IN ${COUNTED_SQL} AND "createdAt" >= ${s.month})::int AS "usersMonth",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" = 'blocked' AND "metadata"->>'period' = 'day' AND "createdAt" >= ${s.day})::int AS "hitDailyToday",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" = 'blocked' AND "metadata"->>'period' = 'day' AND "createdAt" >= ${s.month})::int AS "hitDailyMonth",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" = 'blocked' AND "metadata"->>'period' = 'week' AND "createdAt" >= ${s.week})::int AS "hitWeeklyWeek",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" = 'blocked' AND "metadata"->>'period' = 'week' AND "createdAt" >= ${s.month})::int AS "hitWeeklyMonth",
      COUNT(DISTINCT "userId") FILTER (WHERE "status" = 'blocked' AND "metadata"->>'period' = 'month' AND "createdAt" >= ${s.month})::int AS "hitMonthlyMonth",
      COUNT(*) FILTER (WHERE "status" = 'failed' AND "createdAt" >= ${s.month})::int AS "failedMonth",
      COUNT(*) FILTER (WHERE "status" = 'released' AND "createdAt" >= ${s.month})::int AS "freeMonth"
    FROM "UsageRecord"
    WHERE "createdAt" >= ${s.earliest}
    GROUP BY "feature"`;
  const byFeature = new Map(rows.map((r) => [r.feature, r]));
  const near = await peopleNearLimits();
  return {
    timezone: 'UTC',
    periods: Object.fromEntries(PERIODS.map((p) => [p, { start: s[p].toISOString() }])),
    features: FEATURE_KEYS.map((feature) => {
      const r = byFeature.get(feature) ?? {};
      const n = (k) => r[k] ?? 0;
      return {
        feature,
        label: FEATURES[feature].label,
        unit: FEATURES[feature].unit,
        units: { day: n('unitsDay'), week: n('unitsWeek'), month: n('unitsMonth') },
        activeUsers: { day: n('usersDay'), week: n('usersWeek'), month: n('usersMonth') },
        reachedLimit: {
          daily: { today: n('hitDailyToday'), thisMonth: n('hitDailyMonth') },
          weekly: { thisWeek: n('hitWeeklyWeek'), thisMonth: n('hitWeeklyMonth') },
          monthly: { thisMonth: n('hitMonthlyMonth') },
        },
        failedThisMonth: n('failedMonth'),
        notChargedThisMonth: n('freeMonth'),
        approaching: near.filter((p) => p.feature === feature && p.status === 'warning').length,
        atLimit: near.filter((p) => p.feature === feature && p.status === 'reached').length,
      };
    }),
    people: near,
  };
}

// People who are past a warning threshold or at a limit right now. Sums that
// ignore resets are an upper bound, so they pick candidates cheaply; each
// candidate is then checked exactly (resets and overrides included).
export async function peopleNearLimits({ max = 100 } = {}) {
  const s = starts();
  const config = await loadUsageConfig();
  const sums = await prisma.$queryRaw`
    SELECT "userId", "feature", "action",
      COALESCE(SUM("units") FILTER (WHERE "createdAt" >= ${s.day}), 0)::int AS "day",
      COALESCE(SUM("units") FILTER (WHERE "createdAt" >= ${s.week}), 0)::int AS "week",
      COALESCE(SUM("units") FILTER (WHERE "createdAt" >= ${s.month}), 0)::int AS "month"
    FROM "UsageRecord"
    WHERE "status" IN ${COUNTED_SQL} AND "createdAt" >= ${s.earliest}
    GROUP BY "userId", "feature", "action"`;
  if (!sums.length) return [];
  const userIds = [...new Set(sums.map((r) => r.userId))];
  const now = new Date();
  const overrides = await prisma.usageOverride.findMany({ where: { userId: { in: userIds }, endedAt: null, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
  const limitsFor = (userId, meter) => {
    const o = overrides.filter((x) => x.userId === userId && x.meter === meter).sort((a, b) => b.createdAt - a.createdAt)[0];
    const row = o ?? (config.limits.get(meter)?.enabled ? config.limits.get(meter) : null);
    if (!row) return null;
    const limits = Object.fromEntries(PERIODS.map((p) => [p, row[LIMIT_FIELD[p]] ?? null]));
    return hasAnyLimit(limits) ? { limits, warnAtPct: config.limits.get(meter)?.warnAtPct ?? config.limits.get(meter.split('.')[0])?.warnAtPct ?? 80 } : null;
  };
  const total = new Map();
  for (const r of sums) {
    for (const meter of [r.feature, meterOf(r.feature, r.action)]) {
      const k = `${r.userId}|${meter}`;
      const t = total.get(k) ?? { userId: r.userId, feature: r.feature, meter, day: 0, week: 0, month: 0 };
      for (const p of PERIODS) t[p] += r[p];
      total.set(k, t);
    }
  }
  const candidates = new Set();
  for (const t of total.values()) {
    const l = limitsFor(t.userId, t.meter);
    if (!l) continue;
    if (PERIODS.some((p) => l.limits[p] !== null && (t[p] >= l.limits[p] || (l.limits[p] > 0 && (t[p] / l.limits[p]) * 100 >= l.warnAtPct)))) candidates.add(`${t.userId}|${t.feature}`);
  }
  if (!candidates.size) return [];
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set([...candidates].map((c) => c.split('|')[0]))] } }, select: { id: true, name: true, email: true, role: true } });
  const out = [];
  for (const u of users) {
    if (isExempt(config, u.role)) continue;
    const features = [...candidates].filter((c) => c.startsWith(`${u.id}|`)).map((c) => c.split('|')[1]);
    for (const snap of await usageSnapshot(u.id, { role: u.role, features })) {
      if (snap.status === 'ok') continue;
      out.push({ userId: u.id, name: u.name, email: u.email, feature: snap.feature, label: snap.label, status: snap.status, headline: snap.headline, actions: snap.actions, source: snap.source });
      if (out.length >= max) return out;
    }
  }
  return out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'reached' ? -1 : 1));
}

// One feature in detail: per action per day (last 30 days), per-action
// totals, tokens, outside calls by source, the heaviest users this month.
export async function featureBreakdown(feature) {
  const s = starts();
  const since = new Date(s.day.getTime() - 29 * DAY_MS);
  const [daily, actions, sources, top] = await Promise.all([
    prisma.$queryRaw`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "day", "action", COALESCE(SUM("units"), 0)::int AS "units"
      FROM "UsageRecord"
      WHERE "feature" = ${feature} AND "status" IN ${COUNTED_SQL} AND "createdAt" >= ${since}
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw`
      SELECT r."action",
        COALESCE(SUM(r."units") FILTER (WHERE r."status" IN ${COUNTED_SQL} AND r."createdAt" >= ${s.day}), 0)::int AS "day",
        COALESCE(SUM(r."units") FILTER (WHERE r."status" IN ${COUNTED_SQL} AND r."createdAt" >= ${s.week}), 0)::int AS "week",
        COALESCE(SUM(r."units") FILTER (WHERE r."status" IN ${COUNTED_SQL} AND r."createdAt" >= ${s.month}), 0)::int AS "month",
        COUNT(*) FILTER (WHERE r."status" = 'failed' AND r."createdAt" >= ${s.month})::int AS "failed",
        COUNT(*) FILTER (WHERE r."status" = 'released' AND r."createdAt" >= ${s.month})::int AS "notCharged",
        COALESCE(SUM(r."inputTokens") FILTER (WHERE r."createdAt" >= ${s.month}), 0)::bigint AS "inputTokens",
        COALESCE(SUM(r."outputTokens") FILTER (WHERE r."createdAt" >= ${s.month}), 0)::bigint AS "outputTokens",
        COALESCE(SUM(r."totalTokens") FILTER (WHERE r."createdAt" >= ${s.month}), 0)::bigint AS "totalTokens",
        COUNT(*) FILTER (WHERE r."totalTokens" IS NOT NULL AND r."createdAt" >= ${s.month})::int AS "withTokens",
        COALESCE(SUM(u."calls") FILTER (WHERE r."createdAt" >= ${s.month}), 0)::int AS "upstreamCalls",
        COALESCE(SUM((r."metadata"->>'cacheHits')::int) FILTER (WHERE r."createdAt" >= ${s.month}), 0)::int AS "cacheHits"
      FROM "UsageRecord" r
      LEFT JOIN LATERAL (SELECT SUM(value::int) AS "calls" FROM jsonb_each_text(COALESCE(r."metadata"->'upstream', '{}'::jsonb))) u ON true
      WHERE r."feature" = ${feature} AND r."createdAt" >= ${s.earliest}
      GROUP BY r."action"`,
    prisma.$queryRaw`
      SELECT e.key AS "source", COALESCE(SUM(e.value::int), 0)::int AS "calls"
      FROM "UsageRecord" r, jsonb_each_text(COALESCE(r."metadata"->'upstream', '{}'::jsonb)) e
      WHERE r."feature" = ${feature} AND r."createdAt" >= ${s.month}
      GROUP BY e.key ORDER BY 2 DESC`,
    prisma.$queryRaw`
      SELECT r."userId", u."name", u."email", COALESCE(SUM(r."units"), 0)::int AS "units"
      FROM "UsageRecord" r JOIN "User" u ON u."id" = r."userId"
      WHERE r."feature" = ${feature} AND r."status" IN ${COUNTED_SQL} AND r."createdAt" >= ${s.month}
      GROUP BY r."userId", u."name", u."email" ORDER BY 4 DESC LIMIT 10`,
  ]);
  const num = (v) => Number(v ?? 0);
  return {
    feature,
    label: FEATURES[feature].label,
    unit: FEATURES[feature].unit,
    since: since.toISOString(),
    daily,
    actions: actions
      .map((a) => ({
        action: a.action,
        label: actionLabel(feature, a.action),
        units: { day: a.day, week: a.week, month: a.month },
        failedThisMonth: a.failed,
        notChargedThisMonth: a.notCharged,
        tokensThisMonth: a.withTokens ? { input: num(a.inputTokens), output: num(a.outputTokens), total: num(a.totalTokens), requests: a.withTokens } : null,
        upstreamCallsThisMonth: a.upstreamCalls,
        cacheHitsThisMonth: a.cacheHits,
      }))
      .sort((a, b) => b.units.month - a.units.month),
    sources,
    topUsers: top,
  };
}

export async function userUsageDetail(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, username: true, role: true, status: true } });
  if (!user) return null;
  const [features, overrides, resets, recent] = await Promise.all([
    usageSnapshot(user.id, { role: user.role }),
    prisma.usageOverride.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.usageReset.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.usageRecord.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  const now = new Date();
  const adminIds = [...new Set([...overrides.map((o) => o.createdBy), ...resets.map((r) => r.createdBy)])];
  const admins = new Map((await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
  return {
    user,
    exempt: isExempt(await loadUsageConfig(), user.role),
    features,
    overrides: overrides.map((o) => ({ ...o, createdByName: admins.get(o.createdBy) ?? null, active: !o.endedAt && o.startsAt <= now && (!o.expiresAt || o.expiresAt > now), upcoming: !o.endedAt && o.startsAt > now })),
    resets: resets.map((r) => ({ ...r, createdByName: admins.get(r.createdBy) ?? null })),
    recent: recent.map(recordView),
  };
}

export function recordView(r) {
  return {
    id: r.id,
    userId: r.userId,
    feature: r.feature,
    featureLabel: FEATURES[r.feature]?.label ?? r.feature,
    action: r.action,
    actionLabel: actionLabel(r.feature, r.action),
    units: r.units,
    status: r.status,
    provider: r.provider,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: r.totalTokens,
    estimatedCost: r.estimatedCost === null ? null : Number(r.estimatedCost),
    latencyMs: r.latencyMs,
    metadata: r.metadata,
    createdAt: r.createdAt,
    settledAt: r.settledAt,
  };
}

// The ledger, newest first, 50 at a time (cursor = the last row's id).
export async function usageRecords({ userId, feature, action, status, from, to, cursor, take = 50 } = {}) {
  const where = {
    ...(userId ? { userId } : {}),
    ...(feature ? { feature } : {}),
    ...(action ? { action } : {}),
    ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const rows = await prisma.usageRecord.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { user: { select: { name: true, email: true } } },
  });
  const more = rows.length > take;
  const page = rows.slice(0, take);
  return { records: page.map((r) => ({ ...recordView(r), userName: r.user?.name ?? null, userEmail: r.user?.email ?? null })), nextCursor: more ? page.at(-1).id : null };
}
