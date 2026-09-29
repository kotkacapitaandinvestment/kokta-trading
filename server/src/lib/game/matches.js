// Match lifecycle. States (explicit, stored, every change logged in
// GameMatchTransition):
//
//   CREATED → WAITING_FOR_OPPONENT → READY → LOCKED → COUNTDOWN → ACTIVE
//     → COMPLETED → SCORING → SETTLEMENT → SETTLED
//   failure: CANCELLED, EXPIRED, ABANDONED, DISPUTED, REFUNDED
//
// Stakes move from available to locked when a player enters (creating or
// joining), so the same money can't be staked twice. Time-based steps
// (countdown → active → completed) are applied whenever a match is read
// (advance) and by the scheduled sweep, so nothing depends on a browser
// being open. Scoring and settlement run in one transaction on a locked
// match row: they happen once, or not at all and are retried.

import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { loadGameSettings } from './config.js';
import { generateMarket, drawScenario, candlesUpTo, candleRange, templateOf, GENERATOR_VERSION } from './market.js';
import { pairOf, publicPair } from './pairs.js';
import { simulate, validateAction } from './trading.js';
import { scorePlayer } from './scoring.js';
import { post, walletFor, HOUSE_WALLET, stakedToday, kobo } from './wallet.js';
import { awardProgress } from './progression.js';
import { notify } from '../community/notify.js';

export const LIVE = ['WAITING_FOR_OPPONENT', 'READY', 'LOCKED', 'COUNTDOWN', 'ACTIVE', 'COMPLETED', 'SCORING', 'SETTLEMENT'];
export const FINAL = ['SETTLED', 'CANCELLED', 'EXPIRED', 'ABANDONED', 'DISPUTED', 'REFUNDED'];

// Interactive transactions wait on row locks (two players confirming at
// once); the defaults (2s wait, 5s run) are too short on a remote database.
export const TX = { maxWait: 15000, timeout: 20000 };

export class GameError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.expose = true;
    this.status = status;
    this.code = code;
  }
}

const now = () => new Date();
const newCode = () => crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'X').slice(0, 7).toUpperCase();

// Markets are regenerated from their seed; keep a few in memory.
const markets = new Map();
export function marketFor(match) {
  const bgTicks = match.rules?.backgroundTicks ?? 0;
  const key = `${match.scenario}:${match.seed}:${match.generatorVersion}:${match.symbol}:${bgTicks}:${match.durationSec}:${match.candleSec}:${match.historyCandles}`;
  let m = markets.get(key);
  if (!m) {
    m = generateMarket({ scenario: match.scenario, seed: match.seed, durationSec: match.durationSec, candleSec: match.candleSec, historyCandles: match.historyCandles, symbol: match.symbol, backgroundTicks: bgTicks, version: match.generatorVersion });
    markets.set(key, m);
    if (markets.size > 20) markets.delete(markets.keys().next().value);
  }
  return m;
}

// The match tick for a moment in time (−1 before the start).
export function tickAt(match, at = now()) {
  if (!match.startsAt) return -1;
  const t = Math.floor(((at.getTime() - match.startsAt.getTime()) / 1000) * match.speed);
  return Math.min(t, match.durationSec);
}

async function record(tx, matchId, fromState, toState, actorId = null, reason = null) {
  await tx.gameMatchTransition.create({ data: { matchId, fromState, toState, actorId, reason } });
}

// Change state only if the match is still in one of `from`. Returns true if it changed.
async function move(tx, match, from, to, data = {}, actorId = null, reason = null) {
  const r = await tx.gameMatch.updateMany({ where: { id: match.id, status: { in: [].concat(from) } }, data: { status: to, ...data } });
  if (r.count) await record(tx, match.id, match.status, to, actorId, reason);
  if (r.count) match.status = to;
  return r.count > 0;
}

const lockMatch = async (tx, id) => (await tx.$queryRaw`SELECT * FROM "GameMatch" WHERE "id" = ${id} FOR UPDATE`)[0] ?? null;

// ── Eligibility ────────────────────────────────────────────────────────────

async function assertCanPlayForMoney(userId, s) {
  if (!s.matchesEnabled) throw new GameError('Competitions are paused right now. Please try again later.', 503, 'matches_paused');
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, kyc: { select: { status: true } } } });
  if (!u || u.status !== 'active') throw new GameError('Your account can’t enter competitions.', 403);
  if (u.kyc?.status !== 'approved') throw new GameError('Competitions with a stake need your identity to be verified first. You can play practice matches meanwhile.', 403, 'kyc_required_for_money');
}

function checkStake(stakeKobo, s) {
  if (!Number.isInteger(stakeKobo) || stakeKobo < s.minStakeKobo || stakeKobo > s.maxStakeKobo || (stakeKobo - s.minStakeKobo) % s.stakeStepKobo !== 0) {
    throw new GameError(`Choose a stake from ₦${s.minStakeKobo / 100} to ₦${s.maxStakeKobo / 100}, in steps of ₦${s.stakeStepKobo / 100}.`);
  }
}

// Fee and prizes for a stake, all in kobo. The remainder of an odd split goes to the house.
export function money(stakeKobo, feeBps) {
  const pool = stakeKobo * 2;
  const fee = Math.floor((pool * feeBps) / 10000);
  const prize = pool - fee;
  const drawEach = Math.floor(prize / 2);
  return { pool, fee, prize, drawEach, drawRemainder: prize - drawEach * 2 };
}

// ── Creating and joining ───────────────────────────────────────────────────

export async function createMatch(user, { mode = 'duel', stakeKobo = 0, durationSec, opponentId = null, open = false, rematchOfId = null, symbol = null }) {
  const s = await loadGameSettings();
  if (symbol != null && !s.pairs.includes(symbol)) throw new GameError('Choose one of the Kotka pairs on offer.');
  // No pair chosen: any of those on offer.
  const pair = symbol ?? s.pairs[crypto.randomInt(s.pairs.length)];
  const duration = durationSec ?? s.defaultDurationSec;
  if (!s.durations.includes(duration)) throw new GameError('Choose one of the match lengths on offer.');
  const practice = mode === 'practice';
  if (!practice) {
    await assertCanPlayForMoney(user.id, s);
    checkStake(stakeKobo, s);
    if (!open && !opponentId) throw new GameError('Choose who to challenge, or make it an open challenge.');
    if (opponentId === user.id) throw new GameError('You can’t challenge yourself.');
    if (opponentId) {
      const opp = await prisma.user.findUnique({ where: { id: opponentId }, select: { status: true } });
      if (!opp || opp.status !== 'active') throw new GameError('We couldn’t find that trader.', 404);
    }
    const pending = await prisma.gameMatch.count({ where: { creatorId: user.id, status: 'WAITING_FOR_OPPONENT' } });
    if (pending >= s.maxOpenChallenges) throw new GameError(`You already have ${pending} challenges waiting. Cancel one or wait for them to be accepted.`);
    if ((await stakedToday(user.id)) + stakeKobo > s.dailyStakeLimitKobo) throw new GameError(`That would take your stakes today over the daily limit of ₦${(s.dailyStakeLimitKobo / 100).toLocaleString('en-NG')}.`);
  }
  await assertNotInLiveMatch(user.id);

  const { scenario, seed } = drawScenario(s.scenarios);
  const backgroundTicks = Math.round(s.backgroundHours * 3600);
  const market = generateMarket({ scenario, seed, durationSec: duration, candleSec: s.candleSec, historyCandles: s.historyCandles, symbol: pair, backgroundTicks });
  const at = now();
  const rules = { trading: s.trading, weights: s.weights, scoring: s.scoring, drawTolerance: s.drawTolerance, noTradeRefund: s.noTradeRefund, revealScenario: s.revealScenario, backgroundTicks };
  const base = {
    code: newCode(),
    mode: practice ? 'practice' : 'duel',
    scenario,
    scenarioCode: market.code,
    symbol: pair,
    seed,
    generatorVersion: GENERATOR_VERSION,
    marketHash: market.hash,
    durationSec: duration,
    candleSec: s.candleSec,
    historyCandles: s.historyCandles,
    speed: s.speed,
    startingCapital: s.startingCapital,
    stakeKobo: BigInt(practice ? 0 : stakeKobo),
    feeBps: practice ? 0 : s.feeBps,
    rules,
    creatorId: user.id,
    invitedUserId: practice ? null : opponentId,
    isOpen: !practice && open && !opponentId,
    rematchOfId,
  };

  const match = await prisma.$transaction(async (tx) => {
    if (practice) {
      const startsAt = new Date(at.getTime() + 5000);
      const m = await tx.gameMatch.create({ data: { ...base, status: 'COUNTDOWN', startsAt, endsAt: new Date(startsAt.getTime() + (duration * 1000) / s.speed), players: { create: { userId: user.id, role: 'solo', confirmedAt: at } } } });
      for (const [f, t] of [[null, 'CREATED'], ['CREATED', 'READY'], ['READY', 'LOCKED'], ['LOCKED', 'COUNTDOWN']]) await record(tx, m.id, f, t, user.id, 'practice');
      return m;
    }
    const minutes = opponentId ? s.directChallengeMinutes : s.openChallengeMinutes;
    const m = await tx.gameMatch.create({ data: { ...base, status: 'WAITING_FOR_OPPONENT', expiresAt: new Date(at.getTime() + minutes * 60e3), players: { create: { userId: user.id, role: 'creator' } } } });
    await record(tx, m.id, null, 'CREATED', user.id);
    await record(tx, m.id, 'CREATED', 'WAITING_FOR_OPPONENT', user.id);
    const w = await walletFor(user.id, tx);
    await post(tx, { walletId: w.id, userId: user.id, type: 'stake_lock', amount: stakeKobo, available: -stakeKobo, locked: stakeKobo, key: `stake_lock:${m.id}:${user.id}`, matchId: m.id });
    return m;
  }, TX);

  if (opponentId) {
    notify([{ userId: opponentId, type: 'challenge', actorId: user.id, title: `${user.name} challenged you to a trading match`, body: `Stake ₦${(stakeKobo / 100).toLocaleString('en-NG')} each. Same market, same information, different decisions.`, link: `/app/game/matches/${match.id}` }]).catch(() => {});
  }
  return match;
}

async function assertNotInLiveMatch(userId) {
  const live = await prisma.gamePlayer.findFirst({ where: { userId, match: { status: { in: ['READY', 'LOCKED', 'COUNTDOWN', 'ACTIVE'] } } }, select: { matchId: true } });
  if (live) throw new GameError('Finish the match you’re in first.', 409, 'in_match');
}

export async function joinMatch(user, matchId) {
  const s = await loadGameSettings();
  await assertCanPlayForMoney(user.id, s);
  await assertNotInLiveMatch(user.id);
  const at = now();
  const result = await prisma.$transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (!m || m.mode !== 'duel') throw new GameError('We couldn’t find that challenge.', 404);
    if (m.status !== 'WAITING_FOR_OPPONENT') throw new GameError('That challenge has already been taken or has closed.', 409);
    if (m.expiresAt && m.expiresAt <= at) throw new GameError('That challenge has expired.', 409);
    if (m.creatorId === user.id) throw new GameError('You can’t accept your own challenge.');
    if (m.invitedUserId && m.invitedUserId !== user.id) throw new GameError('That challenge is for someone else.', 403);
    const stake = kobo(m.stakeKobo);
    if ((await stakedToday(user.id)) + stake > s.dailyStakeLimitKobo) throw new GameError('That would take your stakes today over the daily limit.');
    await tx.gamePlayer.create({ data: { matchId: m.id, userId: user.id, role: 'opponent' } });
    const w = await walletFor(user.id, tx);
    await post(tx, { walletId: w.id, userId: user.id, type: 'stake_lock', amount: stake, available: -stake, locked: stake, key: `stake_lock:${m.id}:${user.id}`, matchId: m.id });
    await move(tx, m, 'WAITING_FOR_OPPONENT', 'READY', { readyBy: new Date(at.getTime() + s.lobbyMinutes * 60e3), invitedUserId: user.id }, user.id);
    return m;
  }, TX);
  notify([{ userId: result.creatorId, type: 'challenge', actorId: user.id, title: `${user.name} accepted your trading challenge`, body: 'Confirm in the lobby to start the countdown.', link: `/app/game/matches/${result.id}` }]).catch(() => {});
  return result;
}

// Both players confirm in the lobby; then the countdown starts.
export async function confirmMatch(user, matchId) {
  const s = await loadGameSettings();
  return prisma.$transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (!m) throw new GameError('We couldn’t find that match.', 404);
    const me = await tx.gamePlayer.findUnique({ where: { matchId_userId: { matchId, userId: user.id } } });
    if (!me) throw new GameError('You’re not in this match.', 403);
    if (m.status !== 'READY') throw new GameError('This match isn’t waiting for confirmation.', 409);
    if (!me.confirmedAt) await tx.gamePlayer.update({ where: { id: me.id }, data: { confirmedAt: now() } });
    const unconfirmed = await tx.gamePlayer.count({ where: { matchId, confirmedAt: null } });
    if (unconfirmed === 0) {
      const startsAt = new Date(Date.now() + s.countdownSec * 1000);
      const endsAt = new Date(startsAt.getTime() + (m.durationSec * 1000) / m.speed);
      await move(tx, m, 'READY', 'LOCKED', {}, user.id, 'both confirmed');
      await move(tx, m, 'LOCKED', 'COUNTDOWN', { startsAt, endsAt }, user.id);
    }
    return m;
  }, TX);
}

// Before the countdown: the creator can withdraw a challenge, the invited
// trader can decline it, and either player can leave the lobby. Stakes go back.
export async function cancelMatch(user, matchId) {
  return prisma.$transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (!m) throw new GameError('We couldn’t find that match.', 404);
    const involved = m.creatorId === user.id || m.invitedUserId === user.id;
    if (!involved) throw new GameError('You’re not in this match.', 403);
    // A practice match has no stake, so you can end it at any point (to switch pair, say).
    if (m.mode === 'practice' && ['LOCKED', 'COUNTDOWN', 'ACTIVE'].includes(m.status)) {
      await move(tx, m, ['LOCKED', 'COUNTDOWN', 'ACTIVE'], 'ABANDONED', {}, user.id, 'practice ended by the player');
      return m;
    }
    if (!['WAITING_FOR_OPPONENT', 'READY'].includes(m.status)) throw new GameError('This match can’t be cancelled any more.', 409);
    await releaseStakes(tx, m, 'stake_release', 'cancelled');
    await move(tx, m, ['WAITING_FOR_OPPONENT', 'READY'], 'CANCELLED', {}, user.id, m.creatorId === user.id ? 'cancelled by the creator' : 'declined');
    return m;
  }, TX);
}

async function releaseStakes(tx, m, type, why) {
  const stake = kobo(m.stakeKobo);
  if (!stake) return;
  const players = await tx.gamePlayer.findMany({ where: { matchId: m.id } });
  for (const p of players) {
    const w = await walletFor(p.userId, tx);
    await post(tx, { walletId: w.id, userId: p.userId, type, amount: stake, available: stake, locked: -stake, key: `release:${m.id}:${p.userId}`, matchId: m.id, reason: why });
    await tx.gamePlayer.update({ where: { id: p.id }, data: { outcome: 'refund', payoutKobo: BigInt(stake) } });
  }
}

// ── Time-based steps ───────────────────────────────────────────────────────

// Applies whatever time has made due. Safe to call from anywhere, any number of times.
export async function advance(matchId) {
  const m = await prisma.gameMatch.findUnique({ where: { id: matchId } });
  if (!m || FINAL.includes(m.status)) return m;
  const at = now();
  if (m.status === 'WAITING_FOR_OPPONENT' && m.expiresAt && m.expiresAt <= at) return expire(m.id, 'nobody accepted in time');
  if (m.status === 'READY' && m.readyBy && m.readyBy <= at) return expire(m.id, 'not confirmed in time');
  if (m.status === 'COUNTDOWN' && m.startsAt <= at) {
    await prisma.$transaction((tx) => move(tx, m, 'COUNTDOWN', 'ACTIVE'), TX);
  }
  if (['COUNTDOWN', 'ACTIVE', 'COMPLETED', 'SCORING', 'SETTLEMENT'].includes(m.status) && m.endsAt && m.endsAt <= at) return finish(m.id);
  return prisma.gameMatch.findUnique({ where: { id: matchId } });
}

async function expire(matchId, reason) {
  await prisma.$transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (!m || !['WAITING_FOR_OPPONENT', 'READY'].includes(m.status)) return;
    await releaseStakes(tx, m, 'stake_release', reason);
    await move(tx, m, ['WAITING_FOR_OPPONENT', 'READY'], 'EXPIRED', {}, null, reason);
  }, TX);
  return prisma.gameMatch.findUnique({ where: { id: matchId } });
}

// Everything that's due, for the scheduled job and busy pages.
export async function sweep({ limit = 50 } = {}) {
  const at = now();
  const due = await prisma.gameMatch.findMany({
    where: {
      OR: [
        { status: 'WAITING_FOR_OPPONENT', expiresAt: { lte: at } },
        { status: 'READY', readyBy: { lte: at } },
        { status: { in: ['COUNTDOWN', 'ACTIVE', 'COMPLETED', 'SCORING', 'SETTLEMENT'] }, endsAt: { lte: at } },
      ],
    },
    select: { id: true },
    take: limit,
  });
  let done = 0;
  for (const { id } of due) {
    try {
      await advance(id);
      done += 1;
    } catch (err) {
      console.error('Game sweep failed for', id, err.message);
    }
  }
  return { due: due.length, done };
}

// ── Scoring and settlement ─────────────────────────────────────────────────

export function decideResult(scores, tolerance) {
  if (scores.length < 2) return { winnerId: null, draw: false };
  const [a, b] = scores;
  if (Math.abs(a.score - b.score) <= tolerance) return { winnerId: null, draw: true };
  return { winnerId: a.score > b.score ? a.userId : b.userId, draw: false };
}

async function finish(matchId) {
  let settledPlayers = [];
  await prisma.$transaction(async (tx) => {
    // One settler at a time; everyone else returns straight away instead of
    // queueing on the row lock (several screens poll the moment a match ends).
    const [{ ok }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${`kotka-match:${matchId}`})) AS ok`;
    if (!ok) return;
    const m = await lockMatch(tx, matchId);
    if (!m || FINAL.includes(m.status) || !m.endsAt || m.endsAt > now()) return;
    if (m.status === 'COUNTDOWN') await move(tx, m, 'COUNTDOWN', 'ACTIVE');
    if (m.status === 'ACTIVE') await move(tx, m, 'ACTIVE', 'COMPLETED');
    await move(tx, m, 'COMPLETED', 'SCORING');

    // The market must be the one the match was created with.
    let market;
    try {
      market = marketFor(m);
      if (market.hash !== m.marketHash) throw new Error('hash mismatch');
    } catch (err) {
      await move(tx, m, 'SCORING', 'DISPUTED', { flags: [...(m.flags ?? []), { at: now(), kind: 'market_integrity', detail: err.message }] }, null, 'the market could not be reproduced; not settled');
      return;
    }

    const rules = m.rules ?? {};
    const players = await tx.gamePlayer.findMany({ where: { matchId: m.id }, orderBy: { createdAt: 'asc' } });
    const actions = await tx.gameAction.findMany({ where: { matchId: m.id }, orderBy: [{ userId: 'asc' }, { seq: 'asc' }] });
    const scored = players.map((p) => {
      const mine = actions.filter((a) => a.userId === p.userId);
      const sim = simulate({ market, actions: mine, capital: m.startingCapital, rules: rules.trading, upTo: m.durationSec - 1, final: true });
      const s = scorePlayer({ market, sim, rules: rules.trading, weights: rules.weights, scoring: rules.scoring });
      return { player: p, userId: p.userId, sim, ...s };
    });

    const practice = m.mode === 'practice';
    const noOneTraded = scored.every((x) => x.sim.trades.length === 0);
    const refund = !practice && rules.noTradeRefund && noOneTraded;
    const decision = practice || refund ? { winnerId: null, draw: false } : decideResult(scored, rules.drawTolerance ?? 1);
    await move(tx, m, 'SCORING', 'SETTLEMENT');

    // Money: stakes leave the players' locked balances into the pool; the
    // pool pays the winner (or both, on a draw) and the house takes the fee.
    const stake = kobo(m.stakeKobo);
    const cash = money(stake, m.feeBps);
    const payouts = new Map();
    if (!practice && stake) {
      if (refund) {
        await releaseStakes(tx, m, 'refund', 'neither player traded');
        for (const x of scored) payouts.set(x.userId, stake);
      } else {
        for (const x of scored) {
          const w = await walletFor(x.userId, tx);
          await post(tx, { walletId: w.id, userId: x.userId, type: 'stake_debit', amount: stake, locked: -stake, key: `stake_debit:${m.id}:${x.userId}`, matchId: m.id });
        }
        await post(tx, { walletId: HOUSE_WALLET, type: 'fee', amount: cash.fee + (decision.draw ? cash.drawRemainder : 0), available: cash.fee + (decision.draw ? cash.drawRemainder : 0), key: `fee:${m.id}`, matchId: m.id, reason: `${m.feeBps / 100}% of a ₦${cash.pool / 100} pool` });
        if (decision.draw) {
          for (const x of scored) {
            const w = await walletFor(x.userId, tx);
            await post(tx, { walletId: w.id, userId: x.userId, type: 'draw_return', amount: cash.drawEach, available: cash.drawEach, key: `draw:${m.id}:${x.userId}`, matchId: m.id });
            payouts.set(x.userId, cash.drawEach);
          }
        } else {
          const w = await walletFor(decision.winnerId, tx);
          await post(tx, { walletId: w.id, userId: decision.winnerId, type: 'winnings', amount: cash.prize, available: cash.prize, key: `win:${m.id}:${decision.winnerId}`, matchId: m.id });
          payouts.set(decision.winnerId, cash.prize);
        }
      }
    }

    for (const x of scored) {
      const outcome = practice ? 'practice' : refund ? 'refund' : decision.draw ? 'draw' : x.userId === decision.winnerId ? 'win' : 'loss';
      await tx.gamePlayer.update({
        where: { id: x.player.id },
        data: {
          finalEquity: x.sim.equity,
          returnPct: x.sim.returnPct,
          maxDrawdownPct: x.sim.maxDrawdownPct,
          score: x.score,
          subscores: x.subscores,
          report: { metrics: x.metrics, findings: x.findings, decisionPoints: x.decisionPoints, learning: x.report, trades: x.sim.trades.map(slimTrade), log: x.sim.log },
          outcome,
          payoutKobo: BigInt(payouts.get(x.userId) ?? 0),
        },
      });
    }
    const result = {
      winnerId: decision.winnerId,
      draw: decision.draw,
      refund,
      scores: scored.map((x) => ({ userId: x.userId, score: x.score, returnPct: x.sim.returnPct })),
      pool: cash.pool,
      fee: refund || practice ? 0 : cash.fee,
      prize: cash.prize,
    };
    await move(tx, m, 'SETTLEMENT', 'SETTLED', { settledAt: now(), result });
    settledPlayers = scored.map((x) => ({ userId: x.userId, score: x.score, subscores: x.subscores, metrics: x.metrics, outcome: practice ? 'practice' : refund ? 'refund' : decision.draw ? 'draw' : x.userId === decision.winnerId ? 'win' : 'loss', scenario: m.scenario, matchId: m.id }));
  }, { ...TX, timeout: 30000 });

  // Progression is separate from money and can't undo a settlement.
  for (const p of settledPlayers) await awardProgress(p).catch((err) => console.error('Progress award failed:', err.message));
  return prisma.gameMatch.findUnique({ where: { id: matchId } });
}

const slimTrade = (t) => ({
  n: t.n,
  side: t.side,
  openTick: t.openTick,
  openPrice: t.openPrice,
  closeTick: t.closeTick,
  exitPrice: t.exitPrice,
  exitReason: t.exitReason,
  pnl: t.pnl,
  returnPct: t.returnPct,
  riskPctAtOpen: t.riskPctAtOpen,
  maxSizePct: Math.round(t.maxSizePct * 10) / 10,
  stopAtOpen: t.stopAtOpen,
  targetAtOpen: t.targetAtOpen,
  thesis: t.thesis,
  entries: t.entries.map((e) => ({ tick: e.tick, price: e.price })),
  exits: t.exits.map((e) => ({ tick: e.tick, price: e.price, reason: e.reason })),
  stops: t.stops,
  targets: t.targets,
});

// Admin: a match that can't be settled normally (DISPUTED, or stuck) gets its stakes back.
export async function refundMatch(adminId, matchId, reason) {
  return prisma.$transaction(async (tx) => {
    const m = await lockMatch(tx, matchId);
    if (!m) throw new GameError('We couldn’t find that match.', 404);
    if (['SETTLED', 'REFUNDED', 'CANCELLED', 'EXPIRED'].includes(m.status)) throw new GameError('This match is already closed.', 409);
    const players = await tx.gamePlayer.findMany({ where: { matchId: m.id } });
    const stake = kobo(m.stakeKobo);
    for (const p of players) {
      if (!stake) break;
      const w = await walletFor(p.userId, tx);
      await post(tx, { walletId: w.id, userId: p.userId, type: 'refund', amount: stake, available: stake, locked: -stake, key: `release:${m.id}:${p.userId}`, matchId: m.id, reason, createdBy: adminId });
      await tx.gamePlayer.update({ where: { id: p.id }, data: { outcome: 'refund', payoutKobo: BigInt(stake) } });
    }
    await move(tx, m, LIVE.concat('DISPUTED'), 'REFUNDED', {}, adminId, reason);
    return m;
  }, TX);
}

export async function disputeMatch(adminId, matchId, reason) {
  const m = await prisma.gameMatch.findUnique({ where: { id: matchId } });
  if (!m || FINAL.includes(m.status)) throw new GameError('Only a live match can be marked as disputed.', 409);
  await prisma.$transaction((tx) => move(tx, m, LIVE, 'DISPUTED', {}, adminId, reason), TX);
  return m;
}

// ── Playing ────────────────────────────────────────────────────────────────

async function playerState(match, userId, market, upTo, final = false) {
  const actions = await prisma.gameAction.findMany({ where: { matchId: match.id, userId }, orderBy: { seq: 'asc' } });
  return { actions, sim: simulate({ market, actions, capital: match.startingCapital, rules: match.rules.trading, upTo, final }) };
}

// One decision from a player, executed at the server's current tick.
export async function act(user, matchId, { type, payload, requestKey, clientTick }) {
  let m = await advance(matchId);
  if (!m) throw new GameError('We couldn’t find that match.', 404);
  const me = await prisma.gamePlayer.findUnique({ where: { matchId_userId: { matchId, userId: user.id } } });
  if (!me) throw new GameError('You’re not in this match.', 403);
  if (m.status !== 'ACTIVE') throw new GameError(m.status === 'COUNTDOWN' ? 'The match hasn’t started yet.' : 'This match has finished.', 409, 'not_active');
  const tick = tickAt(m);
  if (tick < 0 || tick >= m.durationSec) throw new GameError('This match has finished.', 409, 'not_active');

  if (requestKey) {
    const seen = await prisma.gameAction.findUnique({ where: { matchId_userId_requestKey: { matchId, userId: user.id, requestKey } } });
    if (seen) return { duplicate: true, action: seen };
  }
  // A client that claims to have seen the future is flagged and refused.
  if (Number.isInteger(clientTick) && clientTick > tick + 2) {
    await prisma.gameMatch.update({ where: { id: m.id }, data: { flags: [...(m.flags ?? []), { at: now(), kind: 'impossible_timing', userId: user.id, clientTick, serverTick: tick }] } });
    throw new GameError('Your screen is out of step with the match. It will catch up in a moment.', 409, 'out_of_sync');
  }

  const market = marketFor(m);
  const { actions, sim } = await playerState(m, user.id, market, tick);
  const price = market.prices[market.historyTicks + tick];
  const clean = cleanPayload(type, payload);
  const error = validateAction(type, clean, sim, { rules: m.rules.trading, price });
  if (error) throw new GameError(error);
  try {
    const action = await prisma.gameAction.create({ data: { matchId: m.id, userId: user.id, seq: (actions.at(-1)?.seq ?? 0) + 1, tick, type, payload: clean, requestKey: requestKey ?? null, clientTick: Number.isInteger(clientTick) ? clientTick : null } });
    return { duplicate: false, action };
  } catch (err) {
    // Two decisions at the same instant: one wins the sequence number.
    if (err.code === 'P2002') throw new GameError('Another action went through at the same moment. Check your position and try again.', 409, 'conflict');
    throw err;
  }
}

const REASONS = ['breakout', 'support', 'resistance', 'momentum', 'trend', 'reversal', 'indicator', 'multiple'];
const priceOrNull = (v) => (v === null || v === '' || v === undefined ? null : Number(v));
function cleanPayload(type, p = {}) {
  switch (type) {
    case 'open':
      return {
        side: p.side,
        sizePct: Number(p.sizePct),
        stop: priceOrNull(p.stop),
        target: priceOrNull(p.target),
        thesis: p.thesis && {
          view: p.thesis.view,
          reasons: Array.isArray(p.thesis.reasons) ? [...new Set(p.thesis.reasons.filter((r) => REASONS.includes(r)))].slice(0, 5) : [],
          confidence: p.thesis.confidence,
        },
      };
    case 'increase':
      return { sizePct: Number(p.sizePct) };
    case 'reduce':
      return { fraction: Number(p.fraction) };
    case 'modify': {
      const out = {};
      if ('stop' in p) out.stop = priceOrNull(p.stop);
      if ('target' in p) out.target = priceOrNull(p.target);
      return out;
    }
    default:
      return {};
  }
}

// ── Views ──────────────────────────────────────────────────────────────────

const personOf = (u) => (u ? { id: u.id, name: u.name, username: u.username, initials: u.initials, avatarId: u.avatarId } : null);

export function summary(m, people = new Map()) {
  const stake = kobo(m.stakeKobo);
  const cash = money(stake, m.feeBps);
  const tpl = templateOf(m.scenario);
  const reveal = m.status === 'SETTLED' || m.status === 'REFUNDED' || m.rules?.revealScenario;
  return {
    id: m.id,
    code: m.code,
    mode: m.mode,
    status: m.status,
    stakeKobo: stake,
    feeBps: m.feeBps,
    poolKobo: cash.pool,
    feeKobo: cash.fee,
    prizeKobo: cash.prize,
    drawEachKobo: cash.drawEach,
    durationSec: m.durationSec,
    candleSec: m.candleSec,
    startingCapital: m.startingCapital,
    isOpen: m.isOpen,
    creator: personOf(people.get(m.creatorId)),
    invited: personOf(people.get(m.invitedUserId)),
    expiresAt: m.expiresAt,
    readyBy: m.readyBy,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    settledAt: m.settledAt,
    createdAt: m.createdAt,
    scenario: reveal ? { code: m.scenarioCode, name: tpl?.name ?? m.scenario, key: m.scenario } : null,
    pair: publicPair(pairOf(m.symbol)) ?? { symbol: 'KTK', name: 'Kotka market', decimals: 2 },
    rules: { ...m.rules.trading, drawTolerance: m.rules.drawTolerance, noTradeRefund: m.rules.noTradeRefund, weights: m.rules.weights },
    result: m.result ?? null,
    rematchOfId: m.rematchOfId,
  };
}

export async function peopleFor(ids) {
  const list = await prisma.user.findMany({ where: { id: { in: [...new Set(ids.filter(Boolean))] } }, select: { id: true, name: true, username: true, initials: true, avatarId: true } });
  return new Map(list.map((u) => [u.id, u]));
}

// What a player sees, live. Only candles up to the current tick are sent:
// the future of the market never leaves the server.
// The chart's clock: t (market seconds from the match start) ↔ real time.
// Before the start time is known, a fixed stand-in keeps the lobby chart steady.
export const chartBase = (m) => (m.startsAt ? m.startsAt.getTime() : Math.floor(m.createdAt.getTime() / 60000) * 60000);

// The last tick anyone may see: none of the match before it starts, all of it once it has run.
export function visibleTick(m, at = now()) {
  if (!m.startsAt || at < m.startsAt) return -1;
  return Math.min(tickAt(m, at), m.durationSec - 1);
}

export const TIMEFRAMES = [1, 5, 15, 30, 60, 180, 300, 900, 1800, 3600];

// Candles for the chart, any timeframe, page by page. Players only.
export async function chartCandles(user, matchId, { tf, before = null, limit = 300, until = null }) {
  if (!TIMEFRAMES.includes(tf)) throw new GameError('That timeframe isn’t available.');
  const m = await prisma.gameMatch.findUnique({ where: { id: matchId } });
  const me = m && (await prisma.gamePlayer.findUnique({ where: { matchId_userId: { matchId, userId: user.id } } }));
  if (!me) throw new GameError('We couldn’t find that match.', 404);
  const market = marketFor(m);
  let tick = visibleTick(m);
  if (Number.isInteger(until) && until < tick) tick = Math.max(-1, until);
  const { candles, more } = candleRange(market, tf, { beforeT: Number.isInteger(before) ? before : null, limit: Math.min(Math.max(limit, 1), 1000), upToAbs: market.historyTicks + tick });
  const base = chartBase(m);
  return { tf, more, baseMs: base, decimals: market.decimals, lastT: tick, candles: candles.map((c) => ({ ts: base + c.t * 1000, t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })) };
}

export async function matchView(user, matchId, { since = null, ticksSince = null } = {}) {
  const m = await advance(matchId);
  if (!m) throw new GameError('We couldn’t find that match.', 404);
  const players = await prisma.gamePlayer.findMany({ where: { matchId } });
  const me = players.find((p) => p.userId === user.id);
  const canSee = me || (m.status === 'WAITING_FOR_OPPONENT' && (m.isOpen || m.invitedUserId === user.id));
  if (!canSee) throw new GameError('We couldn’t find that match.', 404);
  if (me) await prisma.gamePlayer.update({ where: { id: me.id }, data: { lastSeenAt: now() } }).catch(() => {});
  const people = await peopleFor([m.creatorId, m.invitedUserId, ...players.map((p) => p.userId)]);
  const view = { serverNow: now(), match: summary(m, people), players: players.map((p) => ({ userId: p.userId, role: p.role, confirmed: !!p.confirmedAt, person: personOf(people.get(p.userId)), online: p.lastSeenAt ? Date.now() - p.lastSeenAt.getTime() < 12000 : false })) };
  // Time is up but another request is still settling: show it as scoring.
  if (['ACTIVE', 'COUNTDOWN'].includes(m.status) && m.endsAt && m.endsAt <= now()) view.match.status = 'COMPLETED';
  if (!me) return view;

  const market = marketFor(m);
  const H = market.historyTicks;
  const settled = m.status === 'SETTLED';
  const tick = ['ACTIVE'].includes(m.status) ? Math.min(tickAt(m), m.durationSec - 1) : settled ? m.durationSec - 1 : -1;
  const visibleTo = tick >= 0 ? H + tick : H - 1;
  view.tick = tick;
  view.price = market.prices[visibleTo];
  view.chart = { symbol: m.symbol, decimals: market.decimals, baseMs: chartBase(m), historyTicks: H, lastT: visibleTo - H, candleSec: m.candleSec, timeframes: TIMEFRAMES };
  // New one-second prices since the client's last one (the live bar), capped.
  if (Number.isInteger(ticksSince)) {
    const from = Math.max(ticksSince + 1, -H);
    const to = visibleTo - H;
    if (to - from > 600) view.ticksReset = true;
    else {
      view.ticks = [];
      for (let t = from; t <= to; t++) view.ticks.push([t, market.prices[H + t], market.volumes[H + t]]);
    }
  }
  // Older app versions ask with `since` and draw their own candles.
  if (since !== null) {
    const candles = candlesUpTo(market, visibleTo);
    view.candles = candles.filter((c) => c.i >= Math.max(0, since - 1));
    view.totalCandles = candles.length;
  }

  if (tick >= 0 && !settled) {
    const { sim } = await playerState(m, user.id, market, tick);
    view.me = { position: sim.position, equity: sim.equity, cash: sim.cash, returnPct: sim.returnPct, maxDrawdownPct: sim.maxDrawdownPct, stoppedOut: sim.stoppedOut, trades: sim.trades.map(slimTrade), log: sim.log.slice(-40) };
    // The opponent's standing, not their positions: no copying.
    const opp = players.find((p) => p.userId !== user.id);
    if (opp) {
      const o = await playerState(m, opp.userId, market, tick);
      view.opponent = { returnPct: o.sim.returnPct, trades: o.sim.trades.length, inPosition: !!o.sim.position };
    }
  } else if (tick < 0) {
    view.me = { position: null, equity: m.startingCapital, cash: m.startingCapital, returnPct: 0, trades: [], log: [] };
  }
  if (settled) view.report = await resultView(m, players, people, user.id, market);
  return view;
}

async function resultView(m, players, people, viewerId, market) {
  const reveal = (p) => ({
    userId: p.userId,
    person: personOf(people.get(p.userId)),
    outcome: p.outcome,
    score: p.score,
    subscores: p.subscores,
    returnPct: p.returnPct,
    maxDrawdownPct: p.maxDrawdownPct,
    finalEquity: p.finalEquity,
    payoutKobo: kobo(p.payoutKobo),
    report: p.report,
    xpAwarded: p.xpAwarded,
  });
  return {
    players: players.map(reveal),
    viewerId,
    // Replay: the whole market and its events, now that the match is over.
    market: { code: m.scenarioCode, name: templateOf(m.scenario)?.name, seed: m.seed, events: market.events.map((e) => ({ ...e, tick: e.tick - market.historyTicks })).filter((e) => e.tick >= 0), historyTicks: market.historyTicks },
  };
}

// Lists for the game home.
export async function lobby(user) {
  const at = now();
  const [mine, open] = await Promise.all([
    prisma.gameMatch.findMany({ where: { OR: [{ players: { some: { userId: user.id } } }, { invitedUserId: user.id, status: 'WAITING_FOR_OPPONENT' }], status: { in: LIVE } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.gameMatch.findMany({ where: { isOpen: true, status: 'WAITING_FOR_OPPONENT', expiresAt: { gt: at }, creatorId: { not: user.id } }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  for (const m of mine) if ((m.expiresAt && m.expiresAt <= at) || (m.endsAt && m.endsAt <= at) || (m.readyBy && m.readyBy <= at && m.status === 'READY') || (m.status === 'COUNTDOWN' && m.startsAt <= at)) await advance(m.id).catch(() => {});
  const fresh = await prisma.gameMatch.findMany({ where: { id: { in: mine.map((m) => m.id) } }, orderBy: { createdAt: 'desc' } });
  const people = await peopleFor([...fresh, ...open].flatMap((m) => [m.creatorId, m.invitedUserId]));
  return { mine: fresh.map((m) => summary(m, people)), open: open.map((m) => summary(m, people)) };
}

export async function history(userId, { take = 30, cursor } = {}) {
  const rows = await prisma.gamePlayer.findMany({
    where: { userId, match: { status: { in: ['SETTLED', 'REFUNDED'] } } },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { match: { include: { players: { select: { userId: true, score: true, returnPct: true, outcome: true } } } } },
  });
  const more = rows.length > take;
  const page = rows.slice(0, take);
  const people = await peopleFor(page.flatMap((r) => r.match.players.map((p) => p.userId)));
  return {
    matches: page.map((r) => {
      const opp = r.match.players.find((p) => p.userId !== userId);
      return {
        id: r.matchId,
        mode: r.match.mode,
        status: r.match.status,
        settledAt: r.match.settledAt,
        stakeKobo: kobo(r.match.stakeKobo),
        outcome: r.outcome,
        score: r.score,
        returnPct: r.returnPct,
        maxDrawdownPct: r.maxDrawdownPct,
        payoutKobo: kobo(r.payoutKobo),
        scenario: templateOf(r.match.scenario)?.name,
        opponent: opp ? { ...personOf(people.get(opp.userId)), score: opp.score, returnPct: opp.returnPct } : null,
      };
    }),
    nextCursor: more ? page.at(-1).id : null,
  };
}

export async function rematch(user, matchId) {
  const m = await prisma.gameMatch.findUnique({ where: { id: matchId }, include: { players: true } });
  if (!m || !m.players.some((p) => p.userId === user.id)) throw new GameError('We couldn’t find that match.', 404);
  if (!FINAL.includes(m.status)) throw new GameError('Finish this match first.', 409);
  if (m.mode === 'practice') return createMatch(user, { mode: 'practice', durationSec: m.durationSec, symbol: m.symbol ?? null });
  const other = m.players.find((p) => p.userId !== user.id);
  if (!other) throw new GameError('There’s no opponent to rematch.', 409);
  return createMatch(user, { mode: 'duel', stakeKobo: kobo(m.stakeKobo), durationSec: m.durationSec, opponentId: other.userId, rematchOfId: m.id, symbol: m.symbol ?? null });
}
