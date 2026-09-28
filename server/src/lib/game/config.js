// Trading Game settings: one GameSettings row, merged over these defaults.
// Money amounts are kobo (₦1 = 100 kobo; 1 Kotka Credit = ₦1).

import { prisma } from '../prisma.js';
import { TEMPLATE_KEYS } from './market.js';
import { DEFAULT_WEIGHTS, DEFAULT_SCORING } from './scoring.js';
import { defaultTradingRules } from './trading.js';

export const GAME_DEFAULTS = {
  // Switches.
  matchesEnabled: true,
  depositsEnabled: true,
  withdrawalsEnabled: true,
  primaryProvider: 'whop', // whop | paystack
  paystackEnabled: false, // Paystack as a second option people can choose
  withdrawalApproval: 'manual', // manual: an admin approves each one | automatic
  // Money (kobo).
  minDepositKobo: 100_000,
  maxDepositKobo: 50_000_000,
  minWithdrawalKobo: 100_000,
  minStakeKobo: 50_000,
  stakeStepKobo: 50_000,
  maxStakeKobo: 5_000_000,
  dailyStakeLimitKobo: 20_000_000,
  feeBps: 1000, // 10% of the pool
  // Matches.
  startingCapital: 100_000, // virtual ₦, game-only
  durations: [300, 600, 900],
  defaultDurationSec: 900,
  candleSec: 15,
  historyCandles: 80,
  speed: 1,
  countdownSec: 20,
  openChallengeMinutes: 30,
  directChallengeMinutes: 60,
  lobbyMinutes: 10,
  maxOpenChallenges: 3,
  drawTolerance: 1,
  noTradeRefund: true, // neither player traded: stakes back in full, no fee
  revealScenario: false,
  scenarios: TEMPLATE_KEYS,
  weights: DEFAULT_WEIGHTS,
  scoring: DEFAULT_SCORING,
  trading: defaultTradingRules(),
};

const CACHE_MS = 15_000;
let cache = null;

export async function loadGameSettings() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const row = await prisma.gameSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null);
  const c = row?.config && typeof row.config === 'object' ? row.config : {};
  const value = {
    ...GAME_DEFAULTS,
    ...Object.fromEntries(Object.entries(c).filter(([k]) => k in GAME_DEFAULTS)),
    weights: { ...GAME_DEFAULTS.weights, ...(c.weights ?? {}) },
    scoring: { ...GAME_DEFAULTS.scoring, ...(c.scoring ?? {}) },
    trading: { ...GAME_DEFAULTS.trading, ...(c.trading ?? {}) },
  };
  cache = { value, expires: Date.now() + CACHE_MS, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
  return value;
}

export const gameSettingsMeta = () => ({ updatedAt: cache?.updatedAt ?? null, updatedBy: cache?.updatedBy ?? null });
export const clearGameSettingsCache = () => (cache = null);

const int = (v, lo, hi) => (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : undefined);
const num = (v, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : undefined);

const RULES = {
  matchesEnabled: 'bool',
  depositsEnabled: 'bool',
  withdrawalsEnabled: 'bool',
  paystackEnabled: 'bool',
  noTradeRefund: 'bool',
  revealScenario: 'bool',
  primaryProvider: ['whop', 'paystack'],
  withdrawalApproval: ['manual', 'automatic'],
  minDepositKobo: [10_000, 1_000_000_000],
  maxDepositKobo: [10_000, 5_000_000_000],
  minWithdrawalKobo: [10_000, 1_000_000_000],
  minStakeKobo: [10_000, 1_000_000_000],
  stakeStepKobo: [10_000, 1_000_000_000],
  maxStakeKobo: [10_000, 5_000_000_000],
  dailyStakeLimitKobo: [10_000, 50_000_000_000],
  feeBps: [0, 5000],
  startingCapital: [1_000, 100_000_000],
  defaultDurationSec: [60, 3600],
  candleSec: [5, 60],
  historyCandles: [30, 200],
  countdownSec: [5, 120],
  openChallengeMinutes: [5, 1440],
  directChallengeMinutes: [5, 1440],
  lobbyMinutes: [2, 60],
  maxOpenChallenges: [1, 20],
};

// Returns { settings } or { error }.
export function sanitizeGameSettings(input, current) {
  const out = structuredClone(current);
  for (const [k, rule] of Object.entries(RULES)) {
    if (input[k] === undefined) continue;
    if (rule === 'bool') {
      if (typeof input[k] !== 'boolean') return { error: `${k} must be on or off.` };
      out[k] = input[k];
    } else if (Array.isArray(rule) && typeof rule[0] === 'string') {
      if (!rule.includes(input[k])) return { error: `${k} must be one of: ${rule.join(', ')}.` };
      out[k] = input[k];
    } else {
      const v = int(input[k], rule[0], rule[1]);
      if (v === undefined) return { error: `${k} must be a whole number from ${rule[0]} to ${rule[1]}.` };
      out[k] = v;
    }
  }
  if (input.drawTolerance !== undefined) {
    const v = num(input.drawTolerance, 0, 20);
    if (v === undefined) return { error: 'The draw tolerance must be from 0 to 20 score points.' };
    out.drawTolerance = v;
  }
  if (input.speed !== undefined) {
    const v = num(input.speed, 0.5, 10);
    if (v === undefined) return { error: 'Market speed must be from 0.5× to 10×.' };
    out.speed = v;
  }
  if (input.durations !== undefined) {
    if (!Array.isArray(input.durations) || !input.durations.length || input.durations.some((d) => int(d, 60, 3600) === undefined)) return { error: 'Match lengths must be whole seconds from 60 to 3600.' };
    out.durations = [...new Set(input.durations.map(Number))].sort((a, b) => a - b);
  }
  if (input.scenarios !== undefined) {
    const list = Array.isArray(input.scenarios) ? input.scenarios.filter((s) => TEMPLATE_KEYS.includes(s)) : [];
    if (!list.length) return { error: 'Choose at least one kind of market.' };
    out.scenarios = list;
  }
  if (input.weights !== undefined) {
    const w = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const v = int(input.weights?.[k], 0, 100);
      if (v === undefined) return { error: 'Each score weight must be a whole number from 0 to 100.' };
      w[k] = v;
    }
    if (!Object.values(w).some((x) => x > 0)) return { error: 'At least one score weight must be above 0.' };
    out.weights = w;
  }
  if (input.trading !== undefined) {
    const t = input.trading ?? {};
    const spread = num(t.spreadBps ?? out.trading.spreadBps, 0, 100);
    const lev = num(t.maxLeverage ?? out.trading.maxLeverage, 1, 20);
    const so = num(t.stopOutPct ?? out.trading.stopOutPct, 0, 90);
    if (spread === undefined || lev === undefined || so === undefined) return { error: 'Check the trading rules: spread 0–100 basis points, leverage 1–20×, capital floor 0–90%.' };
    out.trading = { ...out.trading, spreadBps: spread, maxLeverage: lev, stopOutPct: so };
  }
  if (out.maxStakeKobo < out.minStakeKobo) return { error: 'The largest stake must be at least the smallest.' };
  if (out.maxDepositKobo < out.minDepositKobo) return { error: 'The largest deposit must be at least the smallest.' };
  if (!out.durations.includes(out.defaultDurationSec)) out.durations = [...out.durations, out.defaultDurationSec].sort((a, b) => a - b);
  return { settings: out };
}

export async function saveGameSettings(settings, actorId) {
  const config = Object.fromEntries(Object.keys(GAME_DEFAULTS).map((k) => [k, settings[k]]));
  await prisma.gameSettings.upsert({ where: { id: 'singleton' }, update: { config, updatedBy: actorId ?? null }, create: { id: 'singleton', config, updatedBy: actorId ?? null } });
  cache = null;
  return loadGameSettings();
}

// The money rules people see before they commit.
export function publicGameRules(s) {
  return {
    minDepositKobo: s.minDepositKobo,
    maxDepositKobo: s.maxDepositKobo,
    minWithdrawalKobo: s.minWithdrawalKobo,
    minStakeKobo: s.minStakeKobo,
    stakeStepKobo: s.stakeStepKobo,
    maxStakeKobo: s.maxStakeKobo,
    dailyStakeLimitKobo: s.dailyStakeLimitKobo,
    feeBps: s.feeBps,
    startingCapital: s.startingCapital,
    durations: s.durations,
    defaultDurationSec: s.defaultDurationSec,
    candleSec: s.candleSec,
    drawTolerance: s.drawTolerance,
    noTradeRefund: s.noTradeRefund,
    weights: s.weights,
    trading: s.trading,
    matchesEnabled: s.matchesEnabled,
    depositsEnabled: s.depositsEnabled,
    withdrawalsEnabled: s.withdrawalsEnabled,
    withdrawalApproval: s.withdrawalApproval,
    openChallengeMinutes: s.openChallengeMinutes,
    directChallengeMinutes: s.directChallengeMinutes,
    lobbyMinutes: s.lobbyMinutes,
    countdownSec: s.countdownSec,
  };
}
