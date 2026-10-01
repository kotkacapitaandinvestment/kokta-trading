// Responsible play (spec §49): limits and breaks a trader sets for
// themselves, on top of Kotka's own limits.
//
// - Deposit limits per day, week and month, and a daily stake limit.
//   Lowering one works at once. Raising or removing one waits 24 hours, so
//   it isn't decided in the middle of a losing streak.
// - A break (a day, a week, a month) or self-exclusion (6 months, a year,
//   5 years) stops deposits and staked competitions until it ends. Neither
//   can be ended early, by the trader or by Kotka staff. Withdrawals and
//   free practice matches stay open.

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { GameError } from './errors.js';
import { kobo } from './wallet.js';

export const LIMIT_KEYS = ['depositDayKobo', 'depositWeekKobo', 'depositMonthKobo', 'stakeDayKobo'];
export const BREAKS = { '24h': 1, '7d': 7, '30d': 30 };
export const EXCLUSIONS = { '6m': 182, '1y': 365, '5y': 1826 };
const DAY = 86400e3;
const COOLING_MS = DAY;
const MAX_LIMIT_KOBO = 1_000_000_000_00; // ₦1bn: anything above is no limit at all

const naira = (k) => `₦${(kobo(k) / 100).toLocaleString('en-NG')}`;
const longDate = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

// The trader's limits, with raised limits applied once their 24 hours are up.
export async function limitsFor(userId, db = prisma) {
  let row = await db.playLimits.findUnique({ where: { userId } });
  if (row?.pendingLimits && row.pendingFrom && row.pendingFrom <= new Date()) {
    const data = {};
    for (const k of LIMIT_KEYS) if (k in row.pendingLimits) data[k] = row.pendingLimits[k] === null ? null : BigInt(row.pendingLimits[k]);
    row = await db.playLimits.update({ where: { userId }, data: { ...data, pendingLimits: Prisma.DbNull, pendingFrom: null } });
  }
  return row;
}

export function limitsView(row) {
  const n = (v) => (v === null || v === undefined ? null : kobo(v));
  const now = new Date();
  return {
    depositDayKobo: n(row?.depositDayKobo),
    depositWeekKobo: n(row?.depositWeekKobo),
    depositMonthKobo: n(row?.depositMonthKobo),
    stakeDayKobo: n(row?.stakeDayKobo),
    pending: row?.pendingLimits ? { limits: row.pendingLimits, from: row.pendingFrom } : null,
    breakUntil: row?.breakUntil && row.breakUntil > now ? row.breakUntil : null,
    excludedUntil: row?.excludedUntil && row.excludedUntil > now ? row.excludedUntil : null,
  };
}

// Refuses real-money play during a break or self-exclusion.
export async function assertMayPlay(userId, db = prisma) {
  const row = await limitsFor(userId, db);
  const now = new Date();
  if (row?.excludedUntil && row.excludedUntil > now) throw new GameError(`You chose to stop real-money play until ${longDate(row.excludedUntil)}. Deposits and staked competitions are closed until then; withdrawals and free practice stay open.`, 403, 'self_excluded');
  if (row?.breakUntil && row.breakUntil > now) throw new GameError(`You’re taking a break from real-money play until ${longDate(row.breakUntil)}. Withdrawals and free practice stay open.`, 403, 'on_break');
  return row;
}

// The trader's own daily stake limit (Kotka's platform limit is checked separately).
export async function assertStakeWithinLimits(db, userId, stakeKobo, stakedTodayKobo) {
  const row = await limitsFor(userId, db);
  if (row?.stakeDayKobo !== null && row?.stakeDayKobo !== undefined && stakedTodayKobo + stakeKobo > kobo(row.stakeDayKobo)) {
    throw new GameError(`That would take today’s stakes over the limit you set yourself (${naira(row.stakeDayKobo)} a day). You can change it in Wallet → Limits and breaks.`, 400, 'personal_limit');
  }
}

// Deposits in a rolling window, counting checkouts still open from the last two hours.
async function depositedSince(userId, since) {
  const agg = await prisma.deposit.aggregate({ where: { userId, createdAt: { gte: since }, OR: [{ status: 'succeeded' }, { status: 'initiated', createdAt: { gte: new Date(Date.now() - 2 * 3600e3) } }] }, _sum: { amountKobo: true } });
  return kobo(agg._sum.amountKobo);
}

export async function assertDepositWithinLimits(userId, amountKobo) {
  const row = await assertMayPlay(userId);
  if (!row) return;
  for (const [key, days, word] of [['depositDayKobo', 1, 'day'], ['depositWeekKobo', 7, 'week'], ['depositMonthKobo', 30, 'month']]) {
    if (row[key] === null || row[key] === undefined) continue;
    const used = await depositedSince(userId, new Date(Date.now() - days * DAY));
    if (used + amountKobo > kobo(row[key])) {
      const left = Math.max(0, kobo(row[key]) - used);
      throw new GameError(`That’s over the deposit limit you set (${naira(row[key])} a ${word}). ${left ? `You can add up to ${naira(left)} now.` : 'You’ve reached it for now.'} You can change it in Wallet → Limits and breaks.`, 400, 'personal_limit');
    }
  }
}

function readLimit(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new GameError('Limits are whole naira amounts, or empty for no limit.');
  return n >= MAX_LIMIT_KOBO ? null : n;
}

/** Sets limits. Returns { limits, applied: [...keys], pending: [...keys] }. */
export async function setLimits(userId, input) {
  const row = await limitsFor(userId);
  const now = { data: {}, applied: [] };
  const later = {};
  for (const k of LIMIT_KEYS) {
    if (!(k in (input ?? {}))) continue;
    const next = readLimit(input[k]);
    const current = row?.[k] === null || row?.[k] === undefined ? null : kobo(row[k]);
    if (next === current) continue;
    const tighter = next !== null && (current === null || next < current);
    if (tighter) {
      now.data[k] = BigInt(next);
      now.applied.push(k);
    } else {
      later[k] = next;
    }
  }
  // A tighter limit also cancels any pending loosening of the same limit.
  const pending = { ...(row?.pendingLimits ?? {}) };
  for (const k of now.applied) delete pending[k];
  Object.assign(pending, later);
  const hasPending = Object.keys(pending).length > 0;
  const saved = await prisma.playLimits.upsert({
    where: { userId },
    update: { ...now.data, pendingLimits: hasPending ? pending : Prisma.DbNull, pendingFrom: hasPending ? (Object.keys(later).length ? new Date(Date.now() + COOLING_MS) : row?.pendingFrom ?? new Date(Date.now() + COOLING_MS)) : null },
    create: { userId, ...now.data, pendingLimits: hasPending ? pending : Prisma.DbNull, pendingFrom: hasPending ? new Date(Date.now() + COOLING_MS) : null },
  });
  return { limits: limitsView(saved), applied: now.applied, pending: Object.keys(later) };
}

/** Starts a break or self-exclusion. It can only ever be made longer. */
export async function takeBreak(userId, kind) {
  const exclusion = kind in EXCLUSIONS;
  const days = EXCLUSIONS[kind] ?? BREAKS[kind];
  if (!days) throw new GameError('Choose how long the break should be.');
  const until = new Date(Date.now() + days * DAY);
  const row = await limitsFor(userId);
  const field = exclusion ? 'excludedUntil' : 'breakUntil';
  if (row?.[field] && row[field] > until) return { limits: limitsView(row), until: row[field], exclusion };
  const saved = await prisma.playLimits.upsert({
    where: { userId },
    update: { [field]: until, ...(exclusion ? { excludedAt: new Date() } : {}) },
    create: { userId, [field]: until, ...(exclusion ? { excludedAt: new Date() } : {}) },
  });
  return { limits: limitsView(saved), until, exclusion };
}
