// Shared Kotka AI accounting: every answered request (chat, journal review,
// Community actions) is one AIUsageLog row with source 'nvidia', and the
// daily cap counts those.
//
// To stop parallel requests from all slipping under the cap, a request first
// reserves a row ('pending') under a per-user database lock, then settles it
// as 'nvidia' (answered) or 'error' (not counted) when it finishes. A pending
// row counts toward the cap while the answer is being written.

import { prisma } from './prisma.js';
import { loadAppSettings, aiDailyLimitFor, PAID_ROLES } from './appSettings.js';

const COUNTED = ['nvidia', 'pending'];

export function logUsage(userId, source, model, startedAt) {
  const latencyMs = Date.now() - startedAt;
  prisma.aIUsageLog.create({ data: { userId, source, model, latencyMs } }).catch((err) => {
    console.error('Failed to record AI usage log:', err.message);
  });
}

// Daily limits reset at midnight UTC.
export function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function limitFor(userId) {
  const [user, settings] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { role: true } }), loadAppSettings()]);
  const role = user?.role ?? 'trader';
  const usageLimit = aiDailyLimitFor(role, settings);
  const onFreePlan = settings.paidPlansEnabled && !PAID_ROLES.includes(role);
  return { usageLimit, limitKind: usageLimit === null ? null : onFreePlan ? 'plan' : 'fair_use', paidPlansEnabled: settings.paidPlansEnabled };
}

const countToday = (db, userId) => db.aIUsageLog.count({ where: { userId, source: { in: COUNTED }, createdAt: { gte: startOfUtcDay() } } });

// usageLimit is null when uncapped. limitKind says why a cap applies: 'plan'
// (free tier, only once paid plans are switched on) or 'fair_use' (everyone,
// to protect the shared model quota).
export async function usageSnapshot(userId) {
  const [limits, usageToday] = await Promise.all([limitFor(userId), countToday(prisma, userId)]);
  return { usageToday, ...limits };
}

export const limitReached = (u) => u.usageLimit !== null && u.usageToday >= u.usageLimit;

// Reserves one request against today's cap. Returns { usage, reservation }
// where reservation is null when the cap is reached.
export async function reserveAiUse(userId) {
  const limits = await limitFor(userId);
  return prisma.$transaction(async (tx) => {
    // Serialises this user's reservations across every server instance.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kotka-ai:${userId}`}))`;
    // A request that died mid-answer (e.g. a timeout) doesn't count forever.
    await tx.aIUsageLog.updateMany({ where: { userId, source: 'pending', createdAt: { lt: new Date(Date.now() - 10 * 60e3) } }, data: { source: 'error' } });
    const usageToday = await countToday(tx, userId);
    const usage = { usageToday, ...limits };
    if (limitReached(usage)) return { usage, reservation: null };
    const row = await tx.aIUsageLog.create({ data: { userId, source: 'pending', model: 'pending', latencyMs: 0 } });
    return { usage: { ...usage, usageToday: usageToday + 1 }, reservation: row.id };
  }, { maxWait: 15000, timeout: 20000 });
}

// source: 'nvidia' (answered, counted), 'error' / 'unavailable' (not counted).
export function settleAiUse(reservation, source, model, startedAt) {
  if (!reservation) return;
  prisma.aIUsageLog
    .update({ where: { id: reservation }, data: { source, model: String(model ?? 'none').slice(0, 120), latencyMs: Date.now() - startedAt } })
    .catch((err) => console.error('Failed to settle AI usage:', err.message));
}

const TONES = {
  'Direct & challenging': 'Be direct and challenging: name weak reasoning plainly and push back hard on bias.',
  'Supportive & measured': 'Be supportive and measured: still challenge weak reasoning, but in a calm, encouraging way.',
  'Purely analytical': 'Be purely analytical: stick to structure, probability and risk, with minimal commentary on psychology unless asked.',
};

export async function tonePreference(userId) {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { aiPreferences: true } }).catch(() => null);
  return TONES[settings?.aiPreferences?.tone] ?? null;
}
