import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { SUPPORTED_CURRENCY_CODES, DEFAULT_PAIRS, parseSubject } from './currencies.js';

export const SOURCE_KEYS = {
  imf_weo: 'IMF World Economic Outlook (current + previous vintage)',
  imf_cofer: 'IMF COFER (currency composition of reserves)',
  fred: 'FRED: Federal Reserve Board, BLS and BEA series',
  ecb: 'ECB Data Portal: policy rates, HICP, yields, CISS',
  eurostat: 'Eurostat: euro area national accounts',
  bis: 'BIS: policy rates, consumer prices, effective exchange rates',
  statements: 'Central bank policy statements (Fed, ECB)',
  calendars: 'Official calendars (FOMC, ECB, BLS, BEA, Eurostat)',
};

export const DEFAULT_SETTINGS = {
  enabled: true,
  availability: 'all', // 'all' | 'premium'
  currencies: SUPPORTED_CURRENCY_CODES,
  pairs: DEFAULT_PAIRS,
  refreshHours: 12,
  userRefreshLimitPerDay: 10,
  aiNarrative: true,
  model: '',
  catalystHorizonDays: 45,
  sources: Object.fromEntries(Object.keys(SOURCE_KEYS).map((k) => [k, true])),
  cron: { tokenHash: null, tokenHint: null, batchSize: 4 },
};

export async function loadSettings() {
  const row = await prisma.researchSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null);
  const cfg = row?.config ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...cfg,
    sources: { ...DEFAULT_SETTINGS.sources, ...(cfg.sources ?? {}) },
    cron: { ...DEFAULT_SETTINGS.cron, ...(cfg.cron ?? {}) },
    updatedAt: row?.updatedAt ?? null,
  };
}

export function sanitizeSettings(input, current) {
  const out = { ...current };
  if (typeof input.enabled === 'boolean') out.enabled = input.enabled;
  if (['all', 'premium'].includes(input.availability)) out.availability = input.availability;
  if (Array.isArray(input.currencies)) out.currencies = input.currencies.map((c) => String(c).toUpperCase()).filter((c) => SUPPORTED_CURRENCY_CODES.includes(c));
  if (Array.isArray(input.pairs)) {
    out.pairs = [...new Set(input.pairs.map((p) => parseSubject(p)).filter((p) => p?.kind === 'pair' && out.currencies.includes(p.base) && out.currencies.includes(p.quote)).map((p) => p.subject))];
  }
  if (Number.isFinite(Number(input.refreshHours))) out.refreshHours = Math.min(168, Math.max(1, Math.round(Number(input.refreshHours))));
  if (Number.isFinite(Number(input.userRefreshLimitPerDay))) out.userRefreshLimitPerDay = Math.min(500, Math.max(0, Math.round(Number(input.userRefreshLimitPerDay))));
  if (Number.isFinite(Number(input.catalystHorizonDays))) out.catalystHorizonDays = Math.min(120, Math.max(7, Math.round(Number(input.catalystHorizonDays))));
  if (typeof input.aiNarrative === 'boolean') out.aiNarrative = input.aiNarrative;
  if (typeof input.model === 'string') out.model = input.model.trim().slice(0, 120);
  if (input.sources && typeof input.sources === 'object') {
    out.sources = { ...current.sources };
    for (const k of Object.keys(SOURCE_KEYS)) if (typeof input.sources[k] === 'boolean') out.sources[k] = input.sources[k];
  }
  if (input.cron && Number.isFinite(Number(input.cron.batchSize))) out.cron = { ...current.cron, batchSize: Math.min(10, Math.max(1, Math.round(Number(input.cron.batchSize)))) };
  return out;
}

export async function saveSettings(config, userId) {
  const { updatedAt, ...clean } = config;
  const row = await prisma.researchSettings.upsert({
    where: { id: 'singleton' },
    update: { config: clean, updatedBy: userId ?? null },
    create: { id: 'singleton', config: clean, updatedBy: userId ?? null },
  });
  return { ...clean, updatedAt: row.updatedAt };
}

// Cron token: only a SHA-256 hash is stored; the plaintext is shown once.
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export async function rotateCronToken(userId) {
  const token = crypto.randomBytes(24).toString('base64url');
  const settings = await loadSettings();
  await saveSettings({ ...settings, cron: { ...settings.cron, tokenHash: hashToken(token), tokenHint: token.slice(-4) } }, userId);
  return token;
}

export function verifyCronToken(settings, presented) {
  if (!settings.cron?.tokenHash || !presented) return false;
  const a = Buffer.from(hashToken(presented), 'hex');
  const b = Buffer.from(settings.cron.tokenHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Settings safe to send to traders (no cron hashes).
export function publicSettings(s) {
  return {
    enabled: s.enabled,
    availability: s.availability,
    currencies: s.currencies,
    pairs: s.pairs,
    refreshHours: s.refreshHours,
    userRefreshLimitPerDay: s.userRefreshLimitPerDay,
  };
}
