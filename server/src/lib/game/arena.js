// The Trading Arena: who's around, who's looking for a match, Quick Match
// pairing, public results, the leaderboard, Trader DNA and learning
// insights. Every number here is counted from real rows, never padded.

import { prisma } from '../prisma.js';
import { loadGameSettings } from './config.js';
import { walletFor, stakedToday, kobo } from './wallet.js';
import { createMatch, joinMatch, cancelMatch, assertCanPlayForMoney, assertNotInLiveMatch, checkStake, money, GameError, peopleFor, personOf, activeIds, TX } from './matches.js';
import { notify } from '../community/notify.js';
import { levelFor } from './progression.js';
import { TEMPLATES, templateOf } from './market.js';

const ONLINE_MS = 2 * 60e3; // seen on a game page this recently counts as online
const QUEUE_HEARTBEAT_MS = 30e3; // a Quick Match search is dropped if the page stops checking in
const QUEUE_MAX_MS = 10 * 60e3; // and ends after ten minutes either way
const BUSY = ['READY', 'LOCKED', 'COUNTDOWN', 'ACTIVE'];

const now = () => new Date();

// Short in-memory caches for the busier, shared reads (per server instance).
const memo = new Map();
async function cached(key, ms, fn) {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  memo.set(key, { value, expires: Date.now() + ms });
  return value;
}

// ── Presence ────────────────────────────────────────────────────────────────

const touched = new Map();
export async function touch(userId) {
  const t = Date.now();
  if ((touched.get(userId) ?? 0) > t - 30e3) return;
  touched.set(userId, t);
  await prisma.gameProfile.upsert({ where: { userId }, update: { lastSeenAt: now() }, create: { userId, lastSeenAt: now() } }).catch(() => {});
}

export function arenaStats() {
  return cached('stats', 10e3, async () => {
    const since = new Date(Date.now() - ONLINE_MS);
    const at = now();
    const [[online], ready, queued, open, activeMatches] = await Promise.all([
      prisma.$queryRaw`SELECT count(*)::int AS n FROM (SELECT "userId" FROM "GameProfile" WHERE "lastSeenAt" > ${since} UNION SELECT "userId" FROM "GamePlayer" WHERE "lastSeenAt" > ${since} AND "userId" IS NOT NULL) x`,
      prisma.gameProfile.findMany({ where: { readyToTrade: true, lastSeenAt: { gt: since } }, select: { userId: true } }),
      prisma.gameQueue.findMany({ where: { matchId: null, expiresAt: { gt: at } }, select: { userId: true } }),
      prisma.gameMatch.findMany({ where: { isOpen: true, status: 'WAITING_FOR_OPPONENT', expiresAt: { gt: at } }, select: { creatorId: true } }),
      prisma.gameMatch.count({ where: { mode: 'duel', status: { in: ['COUNTDOWN', 'ACTIVE'] } } }),
    ]);
    const looking = new Set([...ready.map((r) => r.userId), ...queued.map((q) => q.userId), ...open.map((o) => o.creatorId)]);
    return { online: online.n, looking: looking.size, ready: ready.length, searching: queued.length, activeMatches };
  });
}

// ── Ready to Trade ──────────────────────────────────────────────────────────

export async function setReady(user, on) {
  if (on) await assertCanPlayForMoney(user.id, await loadGameSettings());
  const data = { readyToTrade: !!on, readyAt: on ? now() : null, lastSeenAt: now() };
  await prisma.gameProfile.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
  memo.delete('stats');
  return { ready: !!on };
}

async function recordsFor(ids) {
  if (!ids.length) return new Map();
  const [scores, wins, profiles] = await Promise.all([
    prisma.gamePlayer.groupBy({ by: ['userId'], where: { userId: { in: ids }, score: { not: null }, outcome: { in: ['win', 'loss', 'draw'] } }, _avg: { score: true }, _count: { _all: true } }),
    prisma.gamePlayer.groupBy({ by: ['userId'], where: { userId: { in: ids }, outcome: 'win' }, _count: { _all: true } }),
    prisma.gameProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, xp: true } }),
  ]);
  const out = new Map(ids.map((id) => [id, { matches: 0, wins: 0, avgScore: null, level: 1 }]));
  for (const s of scores) Object.assign(out.get(s.userId), { matches: s._count._all, avgScore: s._avg.score != null ? Math.round(s._avg.score * 10) / 10 : null });
  for (const w of wins) out.get(w.userId).wins = w._count._all;
  for (const p of profiles) out.get(p.userId).level = levelFor(p.xp);
  return out;
}

// Traders who said they're ready and are here now, not already in a match.
export async function readyTraders(user, take = 12) {
  const since = new Date(Date.now() - ONLINE_MS);
  const rows = await prisma.gameProfile.findMany({ where: { readyToTrade: true, lastSeenAt: { gt: since }, userId: { not: user.id }, user: { is: { status: 'active', kyc: { is: { status: 'approved' } } } } }, orderBy: { readyAt: 'desc' }, take: 40, select: { userId: true, readyAt: true } });
  const ids = rows.map((r) => r.userId);
  const busy = new Set((await prisma.gamePlayer.findMany({ where: { userId: { in: ids }, match: { status: { in: BUSY } } }, select: { userId: true } })).map((r) => r.userId));
  const free = rows.filter((r) => !busy.has(r.userId)).slice(0, take);
  const [people, records] = await Promise.all([peopleFor(free.map((r) => r.userId)), recordsFor(free.map((r) => r.userId))]);
  return free.map((r) => ({ person: personOf(people.get(r.userId)), readySince: r.readyAt, ...records.get(r.userId) })).filter((r) => r.person);
}

// ── Quick Match ─────────────────────────────────────────────────────────────

async function assertCanQueue(user, stakeKobo, durationSec) {
  const s = await loadGameSettings();
  await assertCanPlayForMoney(user.id, s);
  checkStake(stakeKobo, s);
  if (!s.durations.includes(durationSec)) throw new GameError('Choose one of the match lengths on offer.');
  await assertNotInLiveMatch(user.id);
  const w = await walletFor(user.id);
  if (w.frozenAt) throw new GameError('Your wallet is on hold while a payment is reviewed. Contact support to clear it.', 403, 'wallet_frozen');
  if (kobo(w.availableKobo) < stakeKobo) throw new GameError(`You need ₦${(stakeKobo / 100).toLocaleString('en-NG')} available for this stake. Add money to your wallet first.`, 409, 'insufficient_funds');
  if ((await stakedToday(user.id)) + stakeKobo > s.dailyStakeLimitKobo) throw new GameError(`That would take your stakes today over the daily limit of ₦${(s.dailyStakeLimitKobo / 100).toLocaleString('en-NG')}.`);
}

const queueView = (q) => ({ status: 'searching', stakeKobo: kobo(q.stakeKobo), durationSec: q.durationSec, since: q.createdAt });

// Look for an opponent on the same terms: an open challenge first, then
// anyone else searching. Nobody found: you wait in the queue.
export async function quickMatch(user, { stakeKobo, durationSec }) {
  await assertCanQueue(user, stakeKobo, durationSec);
  const at = now();

  // An open challenge on the same terms: take it.
  const blockedWith = new Set((await prisma.userRelation.findMany({ where: { kind: 'block', OR: [{ userId: user.id }, { targetId: user.id }] }, select: { userId: true, targetId: true } })).flatMap((b) => [b.userId, b.targetId]));
  const openAll = await prisma.gameMatch.findMany({ where: { isOpen: true, status: 'WAITING_FOR_OPPONENT', expiresAt: { gt: at }, stakeKobo: BigInt(stakeKobo), durationSec, creatorId: { not: user.id } }, orderBy: { createdAt: 'asc' }, take: 6, select: { id: true, creatorId: true } });
  const live = await activeIds(openAll.map((m) => m.creatorId));
  const open = openAll.filter((m) => live.has(m.creatorId) && !blockedWith.has(m.creatorId)).slice(0, 3);
  for (const m of open) {
    try {
      await joinMatch(user, m.id, { quick: true });
      await prisma.gameQueue.deleteMany({ where: { userId: user.id } });
      return { status: 'matched', matchId: m.id };
    } catch (err) {
      if (!(err instanceof GameError) || err.code === 'in_match' || err.code === 'kyc_required_for_money') throw err;
    }
  }

  // Someone else searching. Up to three tries in case a waiting trader can't play any more.
  for (let attempt = 0; attempt < 3; attempt++) {
    const partner = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('kotka-quick-match'))`;
      await tx.gameQueue.deleteMany({ where: { matchId: null, expiresAt: { lte: now() } } });
      // A pairing that never finished (a request that died half-way): let it go.
      await tx.gameQueue.deleteMany({ where: { matchId: 'pairing', expiresAt: { lte: new Date(Date.now() - 60e3) } } });
      const waiting = await tx.gameQueue.findMany({ where: { stakeKobo: BigInt(stakeKobo), durationSec, matchId: null, expiresAt: { gt: now() }, createdAt: { gt: new Date(Date.now() - QUEUE_MAX_MS) }, userId: { not: user.id } }, orderBy: { createdAt: 'asc' }, take: 10 });
      // Never pair people where either has blocked the other.
      const blocks = waiting.length ? await tx.userRelation.findMany({ where: { kind: 'block', OR: [{ userId: user.id, targetId: { in: waiting.map((w) => w.userId) } }, { userId: { in: waiting.map((w) => w.userId) }, targetId: user.id }] }, select: { userId: true, targetId: true } }) : [];
      const avoid = new Set(blocks.flatMap((b) => [b.userId, b.targetId]));
      const other = waiting.find((w) => !avoid.has(w.userId)) ?? null;
      if (!other) {
        const q = await tx.gameQueue.upsert({
          where: { userId: user.id },
          update: { stakeKobo: BigInt(stakeKobo), durationSec, matchId: null, createdAt: now(), expiresAt: new Date(Date.now() + QUEUE_HEARTBEAT_MS) },
          create: { userId: user.id, stakeKobo: BigInt(stakeKobo), durationSec, expiresAt: new Date(Date.now() + QUEUE_HEARTBEAT_MS) },
        });
        return { waiting: q };
      }
      // Claimed, so nobody else pairs with them while the match is made.
      await tx.gameQueue.update({ where: { id: other.id }, data: { matchId: 'pairing' } });
      await tx.gameQueue.deleteMany({ where: { userId: user.id } });
      return { other };
    }, TX);
    if (partner.waiting) {
      memo.delete('stats');
      return queueView(partner.waiting);
    }

    const other = partner.other;
    const them = await prisma.user.findUnique({ where: { id: other.userId }, select: { id: true, name: true, email: true, username: true } });
    let match = null;
    try {
      // The trader who waited longer opens the match; you join it.
      match = await createMatch(them, { mode: 'duel', stakeKobo, durationSec, opponentId: user.id, quick: true });
    } catch (err) {
      // They can't play now (balance spent, another match): drop them and look again.
      if (!(err instanceof GameError)) console.error('Quick Match: could not open the match for the waiting trader:', err.message);
      await prisma.gameQueue.deleteMany({ where: { id: other.id } });
      continue;
    }
    try {
      await joinMatch(user, match.id, { quick: true });
    } catch (err) {
      // It's you who can't: undo their side and put them back in line.
      await cancelMatch(them, match.id).catch(() => {});
      await prisma.gameQueue.updateMany({ where: { id: other.id }, data: { matchId: null } });
      throw err;
    }
    await prisma.gameQueue.updateMany({ where: { id: other.id }, data: { matchId: match.id } });
    memo.delete('stats');
    return { status: 'matched', matchId: match.id };
  }
  // Nobody usable right now: wait.
  const q = await prisma.gameQueue.upsert({
    where: { userId: user.id },
    update: { stakeKobo: BigInt(stakeKobo), durationSec, matchId: null, createdAt: now(), expiresAt: new Date(Date.now() + QUEUE_HEARTBEAT_MS) },
    create: { userId: user.id, stakeKobo: BigInt(stakeKobo), durationSec, expiresAt: new Date(Date.now() + QUEUE_HEARTBEAT_MS) },
  });
  return queueView(q);
}

// The searching screen checks in every few seconds: that keeps the search
// alive and tells it when a match has been made.
export async function queueStatus(user) {
  const q = await prisma.gameQueue.findUnique({ where: { userId: user.id } });
  if (!q) return { status: 'idle' };
  if (q.matchId && q.matchId !== 'pairing') {
    await prisma.gameQueue.deleteMany({ where: { id: q.id } });
    return { status: 'matched', matchId: q.matchId };
  }
  if (q.matchId === 'pairing') {
    if (q.expiresAt > new Date(Date.now() - 60e3)) return queueView(q);
    await prisma.gameQueue.deleteMany({ where: { id: q.id, matchId: 'pairing' } });
    return { status: 'idle' };
  }
  if (q.expiresAt <= now() || q.createdAt <= new Date(Date.now() - QUEUE_MAX_MS)) {
    await prisma.gameQueue.deleteMany({ where: { id: q.id } });
    return { status: 'expired' };
  }
  await prisma.gameQueue.updateMany({ where: { id: q.id, matchId: null }, data: { expiresAt: new Date(Date.now() + QUEUE_HEARTBEAT_MS) } });
  return queueView(q);
}

export async function leaveQueue(user) {
  const q = await prisma.gameQueue.findUnique({ where: { userId: user.id } });
  if (q?.matchId && q.matchId !== 'pairing') {
    await prisma.gameQueue.deleteMany({ where: { id: q.id } });
    return { status: 'matched', matchId: q.matchId };
  }
  await prisma.gameQueue.deleteMany({ where: { userId: user.id, OR: [{ matchId: null }, { matchId: 'pairing', expiresAt: { lte: new Date(Date.now() - 60e3) } }] } });
  memo.delete('stats');
  return { status: 'idle' };
}

// ── Open challenges, with what happened to them ────────────────────────────

const OPEN_STATUS = { WAITING_FOR_OPPONENT: 'looking', READY: 'found', LOCKED: 'starting', COUNTDOWN: 'starting', ACTIVE: 'in_match' };

// Open challenges still waiting, plus those taken in the last half hour
// (opponent found, starting soon, in the match), so the table shows the room.
export async function openBoard(user) {
  const at = now();
  const rows = await prisma.gameMatch.findMany({
    where: {
      isOpen: true,
      OR: [
        { status: 'WAITING_FOR_OPPONENT', expiresAt: { gt: at } },
        { status: { in: ['READY', 'LOCKED', 'COUNTDOWN', 'ACTIVE'] }, createdAt: { gt: new Date(Date.now() - 30 * 60e3) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const people = await peopleFor(rows.flatMap((m) => [m.creatorId, m.invitedUserId]));
  const live = await activeIds(rows.map((m) => m.creatorId));
  const order = { looking: 0, found: 1, starting: 2, in_match: 3 };
  return rows
    .filter((m) => live.has(m.creatorId))
    .map((m) => {
      const stake = kobo(m.stakeKobo);
      const cash = money(stake, m.feeBps);
      return {
        id: m.id,
        status: OPEN_STATUS[m.status],
        mine: m.creatorId === user.id,
        creator: personOf(people.get(m.creatorId)),
        opponent: m.invitedUserId ? personOf(people.get(m.invitedUserId)) : null,
        stakeKobo: stake,
        poolKobo: cash.pool,
        feeKobo: cash.fee,
        feeBps: m.feeBps,
        prizeKobo: cash.prize,
        drawEachKobo: cash.drawEach,
        durationSec: m.durationSec,
        startingCapital: m.startingCapital,
        mode: 'duel',
        pair: m.symbol,
        expiresAt: m.expiresAt,
      };
    })
    .filter((m) => m.status && m.creator)
    .sort((a, b) => order[a.status] - order[b.status])
    .slice(0, 20);
}

// ── Results and the leaderboard ────────────────────────────────────────────

export function recentResults(take = 8) {
  return cached(`recent:${take}`, 30e3, async () => {
    const rows = await prisma.gameMatch.findMany({ where: { mode: 'duel', status: 'SETTLED' }, orderBy: { settledAt: 'desc' }, take, include: { players: { select: { userId: true, score: true, outcome: true } } } });
    const people = await peopleFor(rows.flatMap((m) => m.players.map((p) => p.userId)));
    const active = await activeIds(rows.flatMap((m) => m.players.map((p) => p.userId)));
    return rows
      .map((m) => ({
        id: m.id,
        settledAt: m.settledAt,
        pair: m.symbol,
        durationSec: m.durationSec,
        draw: !!m.result?.draw,
        refund: !!m.result?.refund,
        players: m.players.filter((p) => p.userId && active.has(p.userId)).map((p) => ({ person: personOf(people.get(p.userId)), score: p.score, outcome: p.outcome })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      }))
      .filter((m) => m.players.length === 2 && m.players.every((p) => p.person));
  });
}

const PERIODS = { week: 7, month: 30, all: null };
export const LEADERBOARD_MIN = 3;

// Ranked by average Kotka Performance Score in competitions (process and
// result), not money won. At least three competitions in the period.
export function leaderboard(period = 'week') {
  const days = PERIODS[period] === undefined ? 7 : PERIODS[period];
  return cached(`board:${period}`, 60e3, async () => {
    const since = days ? new Date(Date.now() - days * 86400e3) : null;
    const where = { userId: { not: null }, score: { not: null }, outcome: { in: ['win', 'loss', 'draw'] }, match: { mode: 'duel', status: 'SETTLED', ...(since ? { settledAt: { gte: since } } : {}) } };
    const [all, wins, draws] = await Promise.all([
      prisma.gamePlayer.groupBy({ by: ['userId'], where, _avg: { score: true, returnPct: true }, _count: { _all: true } }),
      prisma.gamePlayer.groupBy({ by: ['userId'], where: { ...where, outcome: 'win' }, _count: { _all: true } }),
      prisma.gamePlayer.groupBy({ by: ['userId'], where: { ...where, outcome: 'draw' }, _count: { _all: true } }),
    ]);
    const winsOf = new Map(wins.map((w) => [w.userId, w._count._all]));
    const drawsOf = new Map(draws.map((w) => [w.userId, w._count._all]));
    const eligible = all.filter((r) => r._count._all >= LEADERBOARD_MIN);
    const [people, profiles, users] = await Promise.all([
      peopleFor(eligible.map((r) => r.userId)),
      prisma.gameProfile.findMany({ where: { userId: { in: eligible.map((r) => r.userId) } }, select: { userId: true, xp: true } }),
      prisma.user.findMany({ where: { id: { in: eligible.map((r) => r.userId) }, status: 'active' }, select: { id: true } }),
    ]);
    const active = new Set(users.map((u) => u.id));
    const xpOf = new Map(profiles.map((p) => [p.userId, p.xp]));
    return eligible
      .filter((r) => active.has(r.userId) && people.get(r.userId))
      .map((r) => {
        const n = r._count._all;
        const w = winsOf.get(r.userId) ?? 0;
        const d = drawsOf.get(r.userId) ?? 0;
        return { person: personOf(people.get(r.userId)), level: levelFor(xpOf.get(r.userId) ?? 0), matches: n, wins: w, draws: d, losses: n - w - d, avgScore: Math.round(r._avg.score * 10) / 10, avgReturnPct: r._avg.returnPct != null ? Math.round(r._avg.returnPct * 100) / 100 : null };
      })
      .sort((a, b) => b.avgScore - a.avgScore || b.matches - a.matches)
      .slice(0, 50)
      .map((r, i) => ({ rank: i + 1, ...r }));
  });
}

// ── What a trader's matches show ───────────────────────────────────────────

export const FAMILY = {
  bull_trend: 'Trending markets',
  bear_trend: 'Trending markets',
  trend_continuation: 'Trending markets',
  momentum_expansion: 'Trending markets',
  range: 'Range-bound markets',
  mean_reversion: 'Range-bound markets',
  low_volatility: 'Range-bound markets',
  breakout: 'Breakouts',
  false_breakout: 'Breakouts',
  reversal: 'Reversals',
  high_volatility: 'Volatile markets',
  volatility_shock: 'Volatile markets',
};
const SUB_LABEL = { risk: 'Risk management', decision: 'Decision quality', execution: 'Execution', consistency: 'Consistency' };
const STYLE = { trend: 'Trend trader', momentum: 'Trend trader', breakout: 'Breakout trader', reversal: 'Reversal trader', support: 'Range trader', resistance: 'Range trader', indicator: 'Confirmation trader', multiple: 'Confirmation trader' };
// The habit, in plain words. Behaviour, never a diagnosis.
const HABIT = {
  size_after_loss: 'You tend to increase your position size after a losing trade.',
  quick_reentry: 'You often trade again straight after a loss.',
  no_stop: 'You often trade without a stop loss.',
  stop_widened: 'You tend to move stop losses further away.',
  stop_removed: 'You sometimes remove stop losses.',
  oversize: 'You often risk more than 5% of your capital on one trade.',
  leverage: 'You often take very large positions.',
  add_losing: 'You tend to add to positions that are losing.',
  chasing: 'You often enter after the price has already moved sharply.',
  unconfirmed: 'You often enter before the market shows the reason you give.',
  thesis_drift: 'You tend to stay in trades after your idea has been invalidated.',
  overtrading: 'You tend to trade a lot in a short match.',
  early_exit: 'You tend to close winning trades well before your target.',
  held_losers: 'You tend to hold losing trades longer than winning ones.',
  gave_back: 'Your winning trades often give back most of their profit.',
  strategy_switching: 'You often switch approach from one trade to the next.',
  inconsistent_risk: 'Your risk per trade varies a lot from trade to trade.',
};
export const DNA_MIN = 5;

async function scoredRows(userId, take = 60) {
  return prisma.gamePlayer.findMany({
    where: { userId, score: { not: null }, outcome: { not: 'refund' } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { score: true, subscores: true, returnPct: true, report: true, outcome: true, createdAt: true, matchId: true, match: { select: { scenario: true, mode: true } } },
  });
}
const traded = (r) => (r.report?.metrics?.trades ?? 0) > 0;
const hasFinding = (r, key) => (r.report?.findings ?? []).some((f) => f.key === key);
const avg = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

function marketsOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const f = FAMILY[r.match.scenario];
    if (!f) continue;
    if (!by.has(f)) by.set(f, []);
    by.get(f).push(r.score);
  }
  return [...by.entries()].filter(([, s]) => s.length >= 2).map(([name, s]) => ({ name, matches: s.length, avgScore: r1(avg(s)) })).sort((a, b) => b.avgScore - a.avgScore);
}

// Trader DNA: a description of how someone trades, from at least five
// matches where they traded. Style comes from the reasons they give.
export async function traderDna(userId) {
  const rows = (await scoredRows(userId)).filter(traded);
  if (rows.length < DNA_MIN) return { ready: false, have: rows.length, need: DNA_MIN };
  const subs = Object.keys(SUB_LABEL).map((k) => [k, avg(rows.map((r) => r.subscores?.[k]).filter((x) => x != null))]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const markets = marketsOf(rows);
  const opens = await prisma.gameAction.findMany({ where: { userId, type: 'open', matchId: { in: rows.map((r) => r.matchId) } }, select: { payload: true } });
  const styles = new Map();
  for (const a of opens) for (const reason of a.payload?.thesis?.reasons ?? []) if (STYLE[reason]) styles.set(STYLE[reason], (styles.get(STYLE[reason]) ?? 0) + 1);
  const style = [...styles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const habits = new Map();
  for (const r of rows) for (const key of new Set((r.report?.findings ?? []).filter((f) => f.tone === 'bad' && HABIT[f.key]).map((f) => f.key))) habits.set(key, (habits.get(key) ?? 0) + 1);
  const top = [...habits.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    ready: true,
    matches: rows.length,
    style,
    strength: subs[0] ? { key: subs[0][0], label: SUB_LABEL[subs[0][0]], score: r1(subs[0][1]) } : null,
    weakness: subs.length > 1 ? { key: subs.at(-1)[0], label: SUB_LABEL[subs.at(-1)[0]], score: r1(subs.at(-1)[1]) } : null,
    strongestMarket: markets[0] ?? null,
    weakestMarket: markets.length > 1 ? markets.at(-1) : null,
    pattern: top && top[1] >= 2 ? { key: top[0], text: HABIT[top[0]], matches: top[1] } : { key: null, text: 'No risky habit shows up again and again in your matches.', matches: 0 },
  };
}

// Learning insights across recent matches: each one only when the data shows it.
export async function insightsFor(userId) {
  const rows = (await scoredRows(userId, 20)).filter(traded);
  const out = [];
  if (rows.length < 3) return { insights: out, have: rows.length, need: 3 };
  const recent = rows.slice(0, 5);
  const earlier = rows.slice(5, 10);
  const noStop = (list) => avg(list.map((r) => r.report?.metrics?.noStopSharePct ?? 0));
  if (earlier.length >= 3) {
    const a = noStop(earlier);
    const b = noStop(recent);
    if (a - b >= 15) out.push({ tone: 'good', text: `Your stop-loss discipline has improved: in your last ${recent.length} matches your positions were unprotected ${Math.round(b)}% of the time, down from ${Math.round(a)}%.` });
    else if (b - a >= 15) out.push({ tone: 'bad', text: `Your positions have been without a stop loss more often lately: ${Math.round(b)}% of the time in your last ${recent.length} matches, up from ${Math.round(a)}%.` });
    const riskA = avg(earlier.map((r) => r.report?.metrics?.avgRiskPct).filter((x) => x != null));
    const riskB = avg(recent.map((r) => r.report?.metrics?.avgRiskPct).filter((x) => x != null));
    if (riskA != null && riskB != null && riskA - riskB >= 1) out.push({ tone: 'good', text: `You risk less per trade than before: about ${r1(riskB)}% of your capital lately, down from ${r1(riskA)}%.` });
    else if (riskA != null && riskB != null && riskB - riskA >= 1) out.push({ tone: 'bad', text: `You risk more per trade than before: about ${r1(riskB)}% of your capital lately, up from ${r1(riskA)}%.` });
  }
  const n = rows.length;
  const count = (key) => rows.filter((r) => hasFinding(r, key)).length;
  const lines = [
    ['size_after_loss', 'bad', (c) => `In ${c} of your last ${n} matches, your position size went up straight after a losing trade.`],
    ['early_exit', 'bad', (c) => `In ${c} of your last ${n} matches, you closed a winning trade well before the target you had planned.`],
    ['held_losers', 'bad', (c) => `In ${c} of your last ${n} matches, you held losing trades much longer than winning ones.`],
    ['thesis_drift', 'bad', (c) => `In ${c} of your last ${n} matches, you stayed in a trade after your original idea had been invalidated.`],
    ['chasing', 'bad', (c) => `In ${c} of your last ${n} matches, you entered after the price had already moved sharply.`],
    ['confirmed', 'good', (c) => `In ${c} of your last ${n} matches, every entry was backed by what the chart showed.`],
    ['respected_stop', 'good', (c) => `In ${c} of your last ${n} matches, your losing trades closed at or before your planned stop.`],
  ];
  for (const [key, tone, text] of lines) {
    const c = count(key);
    if (c >= 2 && c / n >= 0.3) out.push({ tone, text: text(c) });
  }
  const markets = marketsOf(rows);
  if (markets.length >= 2) {
    out.push({ tone: 'good', text: `Your strongest results come in ${markets[0].name.toLowerCase()} (average score ${markets[0].avgScore} over ${markets[0].matches} matches).` });
    out.push({ tone: 'neutral', text: `${markets.at(-1).name} are where you score lowest (average ${markets.at(-1).avgScore}). A practice match or two there is a good next step.` });
  }
  return { insights: out, have: rows.length, need: 3 };
}

// What each kind of market teaches, for the Learn page.
export function lessons() {
  return TEMPLATES.map((t) => ({ key: t.key, name: t.name, family: FAMILY[t.key] ?? null, lesson: t.lesson }));
}

// A trader's recent competitions, as shown on their public record (no money).
export async function publicMatches(userId, take = 10) {
  const rows = await prisma.gamePlayer.findMany({
    where: { userId, outcome: { in: ['win', 'loss', 'draw'] }, match: { mode: 'duel', status: 'SETTLED' } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { score: true, outcome: true, returnPct: true, match: { select: { id: true, symbol: true, settledAt: true, durationSec: true, scenario: true, players: { select: { userId: true, score: true } } } } },
  });
  const people = await peopleFor(rows.flatMap((r) => r.match.players.map((p) => p.userId)));
  return rows.map((r) => {
    const opp = r.match.players.find((p) => p.userId && p.userId !== userId);
    return { id: r.match.id, settledAt: r.match.settledAt, pair: r.match.symbol, durationSec: r.match.durationSec, outcome: r.outcome, score: r.score, returnPct: r.returnPct, market: templateOf(r.match.scenario)?.name ?? null, opponent: opp ? { person: personOf(people.get(opp.userId)), score: opp.score } : null };
  });
}

export async function presenceOf(userId) {
  const p = await prisma.gameProfile.findUnique({ where: { userId }, select: { lastSeenAt: true, readyToTrade: true } });
  const online = !!p?.lastSeenAt && p.lastSeenAt > new Date(Date.now() - ONLINE_MS);
  return { online, ready: online && !!p?.readyToTrade };
}

export { ONLINE_MS };
