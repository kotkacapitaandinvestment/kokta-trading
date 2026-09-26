// Shared Kotka AI accounting: every answered request (chat or journal review)
// is one AIUsageLog row with source 'nvidia', and the daily cap counts those.

import { prisma } from './prisma.js';
import { loadAppSettings, aiDailyLimitFor, PAID_ROLES } from './appSettings.js';

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

// usageLimit is null when uncapped. limitKind says why a cap applies: 'plan'
// (free tier, only once paid plans are switched on) or 'fair_use' (everyone,
// to protect the shared model quota).
export async function usageSnapshot(userId) {
  const [user, settings] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { role: true } }), loadAppSettings()]);
  const role = user?.role ?? 'trader';
  const usageLimit = aiDailyLimitFor(role, settings);
  const usageToday = await prisma.aIUsageLog.count({ where: { userId, source: 'nvidia', createdAt: { gte: startOfUtcDay() } } });
  const onFreePlan = settings.paidPlansEnabled && !PAID_ROLES.includes(role);
  return { usageToday, usageLimit, limitKind: usageLimit === null ? null : onFreePlan ? 'plan' : 'fair_use', paidPlansEnabled: settings.paidPlansEnabled };
}

export const limitReached = (u) => u.usageLimit !== null && u.usageToday >= u.usageLimit;

const TONES = {
  'Direct & challenging': 'Be direct and challenging: name weak reasoning plainly and push back hard on bias.',
  'Supportive & measured': 'Be supportive and measured: still challenge weak reasoning, but in a calm, encouraging way.',
  'Purely analytical': 'Be purely analytical: stick to structure, probability and risk, with minimal commentary on psychology unless asked.',
};

export async function tonePreference(userId) {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { aiPreferences: true } }).catch(() => null);
  return TONES[settings?.aiPreferences?.tone] ?? null;
}
