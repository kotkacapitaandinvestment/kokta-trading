// Platform-wide switches, stored as one AppSettings row. Everything is free
// while paidPlansEnabled is off. Usage limits (Kotka AI, Market Intelligence,
// Fundamental Research) live in Usage Control (lib/usage/), not here.
// Retired keys (aiFairUseDailyLimit, aiDailyLimitFree) were carried into
// UsageLimit by migration 20260928200000_usage_control and drop out of the
// row on the next save.

import { CONTACT } from './contact.js';
import { isEmail } from './validate.js';
import { prisma } from './prisma.js';

export const APP_DEFAULTS = {
  paidPlansEnabled: false,
  signupsOpen: true,
  kycRequired: true,
  supportEmail: '',
  usageStaffExempt: true, // admins and super admins aren't held to usage limits
};

const CACHE_TTL_MS = 30 * 1000;
let cache = null;

export async function loadAppSettings() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const row = await prisma.appSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null);
  const stored = row?.config && typeof row.config === 'object' ? row.config : {};
  const value = Object.fromEntries(Object.keys(APP_DEFAULTS).map((k) => [k, stored[k] ?? APP_DEFAULTS[k]]));
  cache = { value, expires: Date.now() + CACHE_TTL_MS, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
  return value;
}

export function appSettingsMeta() {
  return { updatedAt: cache?.updatedAt ?? null, updatedBy: cache?.updatedBy ?? null };
}


// Returns { settings } or { error }. Unknown keys are dropped.
export function sanitizeAppSettings(input, current) {
  const out = { ...current };
  for (const key of ['paidPlansEnabled', 'signupsOpen', 'kycRequired', 'usageStaffExempt']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') return { error: 'That setting must be on or off.' };
      out[key] = input[key];
    }
  }
  if (input.supportEmail !== undefined) {
    const email = typeof input.supportEmail === 'string' ? input.supportEmail.trim().toLowerCase() : '';
    if (email && !isEmail(email)) return { error: 'That support email doesn’t look right. Check it and try again.' };
    out.supportEmail = email;
  }
  return { settings: out };
}

export async function saveAppSettings(settings, actorId) {
  const config = Object.fromEntries(Object.keys(APP_DEFAULTS).map((k) => [k, settings[k]]));
  // Usage Control reads usageStaffExempt through its own cache.
  const { clearUsageConfigCache } = await import('./usage/config.js');
  clearUsageConfigCache();
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
    // Falls back to Kotka's support address when no override is set.
    supportEmail: s.supportEmail || CONTACT.support,
  };
}

// Where people are sent for account help: the Platform Settings override,
// or Kotka's support address.
export async function supportAddress() {
  const s = await loadAppSettings().catch(() => null);
  return s?.supportEmail || CONTACT.support;
}

export const ADMIN_ROLES = ['admin', 'super_admin'];
export const PAID_ROLES = ['premium', 'admin', 'super_admin'];

// True when a feature marked "paid" should be gated for this role. While paid
// plans are off, nothing is gated.
export function paidFeatureLocked(role, s) {
  return s.paidPlansEnabled && !PAID_ROLES.includes(role);
}
