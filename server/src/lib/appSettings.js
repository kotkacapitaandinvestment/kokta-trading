// Platform-wide switches, stored as one AppSettings row. Everything is free
// while paidPlansEnabled is off; the free-tier AI limit only applies once it
// is switched on, and a fair-use cap protects the model quota either way.

import { prisma } from './prisma.js';

export const APP_DEFAULTS = {
  paidPlansEnabled: false,
  signupsOpen: true,
  kycRequired: true,
  aiFairUseDailyLimit: 150, // messages per user per UTC day; 0 = no cap
  aiDailyLimitFree: 10, // free-plan messages per day, used only when paid plans are on
  supportEmail: '',
};

const CACHE_TTL_MS = 30 * 1000;
let cache = null;

export async function loadAppSettings() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const row = await prisma.appSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null);
  const value = { ...APP_DEFAULTS, ...(row?.config && typeof row.config === 'object' ? row.config : {}) };
  cache = { value, expires: Date.now() + CACHE_TTL_MS, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
  return value;
}

export function appSettingsMeta() {
  return { updatedAt: cache?.updatedAt ?? null, updatedBy: cache?.updatedBy ?? null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function intIn(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

// Returns { settings } or { error }. Unknown keys are dropped.
export function sanitizeAppSettings(input, current) {
  const out = { ...current };
  for (const key of ['paidPlansEnabled', 'signupsOpen', 'kycRequired']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') return { error: 'That setting must be on or off.' };
      out[key] = input[key];
    }
  }
  if (input.aiFairUseDailyLimit !== undefined) {
    const n = intIn(input.aiFairUseDailyLimit, 0, 10000);
    if (n === undefined) return { error: 'The daily Kotka AI limit must be a whole number from 0 to 10,000 (0 means no limit).' };
    out.aiFairUseDailyLimit = n;
  }
  if (input.aiDailyLimitFree !== undefined) {
    const n = intIn(input.aiDailyLimitFree, 0, 10000);
    if (n === undefined) return { error: 'The free-plan Kotka AI limit must be a whole number from 0 to 10,000.' };
    out.aiDailyLimitFree = n;
  }
  if (input.supportEmail !== undefined) {
    const email = typeof input.supportEmail === 'string' ? input.supportEmail.trim().toLowerCase() : '';
    if (email && !EMAIL_RE.test(email)) return { error: 'That support email doesn’t look right. Check it and try again.' };
    out.supportEmail = email;
  }
  return { settings: out };
}

export async function saveAppSettings(settings, actorId) {
  const config = Object.fromEntries(Object.keys(APP_DEFAULTS).map((k) => [k, settings[k]]));
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: { config, updatedBy: actorId ?? null },
    create: { id: 'singleton', config, updatedBy: actorId ?? null },
  });
  cache = null;
  return loadAppSettings();
}

// What any visitor may see (landing page, sign-up form, app shell).
export function publicAppConfig(s) {
  return {
    paidPlansEnabled: s.paidPlansEnabled,
    signupsOpen: s.signupsOpen,
    kycRequired: s.kycRequired,
    supportEmail: s.supportEmail || null,
  };
}

export const ADMIN_ROLES = ['admin', 'super_admin'];
export const PAID_ROLES = ['premium', 'admin', 'super_admin'];

// Daily Kotka AI message cap for a role; null means no cap.
export function aiDailyLimitFor(role, s) {
  if (ADMIN_ROLES.includes(role)) return null;
  const fairUse = s.aiFairUseDailyLimit > 0 ? s.aiFairUseDailyLimit : null;
  if (s.paidPlansEnabled && !PAID_ROLES.includes(role)) {
    return fairUse === null ? s.aiDailyLimitFree : Math.min(s.aiDailyLimitFree, fairUse);
  }
  return fairUse;
}

// True when a feature marked "paid" should be gated for this role. While paid
// plans are off, nothing is gated.
export function paidFeatureLocked(role, s) {
  return s.paidPlansEnabled && !PAID_ROLES.includes(role);
}
