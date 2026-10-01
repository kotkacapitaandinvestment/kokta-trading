// Promotional credits (spec §50) and what they buy.
//
// - Credits come from a campaign or an admin grant, only to verified traders
//   who aren't on a break, and expire. They can be staked, never withdrawn.
// - A stake uses promotional credits first, then the trader's own money, then
//   winnings still tied to earlier promotional stakes ("restricted").
// - A stake that comes back (cancelled, expired, refunded) goes back where
//   it came from. In a draw, each part comes back in proportion.
// - Winning with promotional credits pays real money, but that share of the
//   prize is restricted: it can be staked, not withdrawn, until the trader
//   has staked the same amount of their own money in competitions that ran.
// - Kotka's house wallet pays the cash a promotion creates, so every naira
//   in the ledger is accounted for.
//
// Every change goes through the ledger (post) inside the caller's
// transaction, under the wallet row lock.

import { prisma } from '../prisma.js';
import { post, walletFor, HOUSE_WALLET, kobo } from './wallet.js';
import { GameError } from './errors.js';

const DAY = 86400e3;
const big = (v) => BigInt(v);
const min = (a, b) => (a < b ? a : b);

// Credits whose time is up leave the wallet (ledger: promo_expired).
export async function expireDue(tx, userId) {
  const due = await tx.promoGrant.findMany({ where: { userId, revokedAt: null, remainingKobo: { gt: 0 }, expiresAt: { lte: new Date() } } });
  for (const g of due) {
    const w = await walletFor(userId, tx);
    await post(tx, { walletId: w.id, userId, type: 'promo_expired', creditType: 'promo', amount: g.remainingKobo, promo: -g.remainingKobo, key: `promo_expired:${g.id}`, reason: 'Promotional credits reached their expiry date' });
    await tx.promoGrant.update({ where: { id: g.id }, data: { remainingKobo: 0n } });
  }
  return due.length;
}

// Uses live grants, soonest-expiring first. Returns the latest expiry used.
async function useGrants(tx, userId, amount) {
  let left = big(amount);
  let latest = null;
  if (left <= 0n) return null;
  const grants = await tx.promoGrant.findMany({ where: { userId, revokedAt: null, remainingKobo: { gt: 0 }, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'asc' } });
  for (const g of grants) {
    if (left <= 0n) break;
    const take = min(g.remainingKobo, left);
    await tx.promoGrant.update({ where: { id: g.id }, data: { remainingKobo: g.remainingKobo - take } });
    left -= take;
    if (!latest || g.expiresAt > latest) latest = g.expiresAt;
  }
  if (left > 0n) throw new Error(`Promotional credits for ${userId} are out of step with their grants.`);
  return latest;
}

// Credits coming back from a stake: a new grant that keeps at least a day.
async function returnGrant(tx, userId, amount, expiresAt, reason) {
  if (big(amount) <= 0n) return;
  const floor = new Date(Date.now() + DAY);
  await tx.promoGrant.create({ data: { userId, amountKobo: big(amount), remainingKobo: big(amount), expiresAt: expiresAt && expiresAt > floor ? expiresAt : floor, reason } });
}

/**
 * Locks a stake for a player, promotional credits first. Records where the
 * stake came from on the GamePlayer row. Must run in the match transaction.
 */
export async function lockStake(tx, { userId, matchId, playerId, stake }) {
  await expireDue(tx, userId);
  const w = await walletFor(userId, tx);
  const S = big(stake);
  const p = min(S, w.promoAvailableKobo);
  const rest = S - p;
  const free = w.availableKobo - w.restrictedKobo;
  const c = min(rest, free > 0n ? free : 0n);
  const l = rest - c;
  await post(tx, { walletId: w.id, userId, type: 'stake_lock', amount: S, available: -(c + l), locked: c + l, promo: -p, promoLocked: p, restricted: -l, key: `stake_lock:${matchId}:${userId}`, matchId, creditType: p > 0n ? 'promo' : 'cash', reason: p > 0n ? `₦${kobo(p) / 100} from promotional credits` : null });
  const promoExpiresAt = await useGrants(tx, userId, p);
  await tx.gamePlayer.update({ where: { id: playerId }, data: { stakePromoKobo: p, stakeRestrictedKobo: l, stakePromoExpiresAt: promoExpiresAt } });
  return { promo: kobo(p), restricted: kobo(l), own: kobo(c) };
}

// A player's stake split: promotional, restricted winnings, own money.
const split = (player, stake) => {
  const S = big(stake);
  const p = big(player.stakePromoKobo ?? 0);
  const l = big(player.stakeRestrictedKobo ?? 0);
  return { S, p, l, c: S - p - l };
};

/** A stake coming back whole (cancelled, expired, no-trade refund, admin refund). */
export async function returnStake(tx, { player, matchId, stake, type, reason = null, createdBy = null }) {
  const { S, p, l, c } = split(player, stake);
  const w = await walletFor(player.userId, tx);
  await post(tx, { walletId: w.id, userId: player.userId, type, amount: S, available: c + l, locked: -(c + l), promo: p, promoLocked: -p, restricted: l, key: `release:${matchId}:${player.userId}`, matchId, reason, createdBy, creditType: p > 0n ? 'promo' : 'cash' });
  await returnGrant(tx, player.userId, p, player.stakePromoExpiresAt, 'Returned from a competition stake');
}

/**
 * Settles a competition's money: stakes into the pool, payouts out, the fee
 * to the house, and the cost of any promotional credits to the house.
 * payouts: Map userId → cash amount (kobo) for a win, or the draw share.
 * Returns the per-player amount paid (for GamePlayer.payoutKobo).
 */
export async function settleStakes(tx, { match, players, stake, fee, winnerId, draw, prize, drawEach }) {
  const S = big(stake);
  let cashIn = 0n;
  let cashOut = big(fee);
  const paid = new Map();
  for (const x of players) {
    const { p, l, c } = split(x, S);
    cashIn += c + l;
    const w = await walletFor(x.userId, tx);
    // Own money that went into this competition frees the same amount of
    // winnings tied to earlier promotional stakes.
    const release = min(c, w.restrictedKobo);
    await post(tx, { walletId: w.id, userId: x.userId, type: 'stake_debit', amount: S, locked: -(c + l), promoLocked: -p, restricted: -release, key: `stake_debit:${match.id}:${x.userId}`, matchId: match.id, creditType: p > 0n ? 'promo' : 'cash', reason: release > 0n ? `₦${kobo(release) / 100} of winnings from promotional credits can now be withdrawn` : null });
  }
  if (big(fee) > 0n) await post(tx, { walletId: HOUSE_WALLET, type: 'fee', amount: big(fee), available: big(fee), key: `fee:${match.id}`, matchId: match.id, reason: `${match.feeBps / 100}% of a ₦${(kobo(S) * 2) / 100} pool` });
  if (draw) {
    const D = big(drawEach);
    for (const x of players) {
      const { p, l } = split(x, S);
      const promoBack = (D * p) / S;
      const heldBack = (D * l) / S;
      const cash = D - promoBack;
      const w = await walletFor(x.userId, tx);
      await post(tx, { walletId: w.id, userId: x.userId, type: 'draw_return', amount: D, available: cash, promo: promoBack, restricted: heldBack, key: `draw:${match.id}:${x.userId}`, matchId: match.id, creditType: promoBack > 0n ? 'promo' : 'cash' });
      await returnGrant(tx, x.userId, promoBack, x.stakePromoExpiresAt, 'Your share of a drawn competition');
      cashOut += cash;
      paid.set(x.userId, kobo(D));
    }
  } else if (winnerId) {
    const P = big(prize);
    const x = players.find((y) => y.userId === winnerId);
    const { p, l } = split(x, S);
    const held = (P * (p + l)) / S;
    const w = await walletFor(winnerId, tx);
    await post(tx, { walletId: w.id, userId: winnerId, type: 'winnings', amount: P, available: P, restricted: held, key: `win:${match.id}:${winnerId}`, matchId: match.id, reason: held > 0n ? `₦${kobo(held) / 100} was won with promotional credits: stake the same of your own money to withdraw it` : null });
    cashOut += P;
    paid.set(winnerId, kobo(P));
  }
  // Promotional credits turned into cash: Kotka pays it.
  const cost = cashOut - cashIn;
  if (cost > 0n) await post(tx, { walletId: HOUSE_WALLET, type: 'promo_cost', amount: cost, available: -cost, key: `promo_cost:${match.id}`, matchId: match.id, reason: 'Cash paid out against promotional credits' });
  return paid;
}

// ── Granting, revoking, expiring ───────────────────────────────────────────

/** Gives a verified trader promotional credits. One grant per campaign. */
export async function grantPromo({ userId, amountKobo, expiresAt, campaignId = null, reason = null, createdBy = null }) {
  const amount = big(amountKobo);
  if (amount <= 0n) throw new GameError('Choose an amount above zero.');
  if (!(expiresAt instanceof Date) || expiresAt <= new Date()) throw new GameError('Choose an expiry date in the future.');
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, kyc: { select: { status: true } }, playLimits: { select: { breakUntil: true, excludedUntil: true } } } });
  if (!u || u.status !== 'active') throw new GameError('That account can’t receive promotional credits.', 409);
  if (u.kyc?.status !== 'approved') throw new GameError('Promotional credits go only to traders whose identity is verified.', 409, 'kyc_required_for_money');
  const now = new Date();
  // Responsible play: nobody on a break or self-excluded is offered credits.
  if ((u.playLimits?.breakUntil && u.playLimits.breakUntil > now) || (u.playLimits?.excludedUntil && u.playLimits.excludedUntil > now)) throw new GameError('This trader is taking a break from real-money play, so they can’t be given promotional credits.', 409, 'on_break');
  return prisma.$transaction(async (tx) => {
    const grant = await tx.promoGrant.create({ data: { userId, campaignId, amountKobo: amount, remainingKobo: amount, expiresAt, reason, createdBy } });
    const w = await walletFor(userId, tx);
    await post(tx, { walletId: w.id, userId, type: 'promo_credit', creditType: 'promo', amount, promo: amount, key: `promo_grant:${grant.id}`, reason: reason ?? 'Promotional credits', createdBy });
    return grant;
  }, { maxWait: 15000, timeout: 20000 });
}

/** Removes what's left of a grant (an admin decision). */
export async function revokeGrant(grantId, adminId, reason) {
  return prisma.$transaction(async (tx) => {
    const [g] = await tx.$queryRaw`SELECT * FROM "PromoGrant" WHERE "id" = ${grantId} FOR UPDATE`;
    if (!g) throw new GameError('We couldn’t find that grant.', 404);
    if (g.revokedAt) throw new GameError('That grant was already removed.', 409);
    const left = big(g.remainingKobo);
    if (left > 0n) {
      const w = await walletFor(g.userId, tx);
      await post(tx, { walletId: w.id, userId: g.userId, type: 'promo_revoked', creditType: 'promo', amount: left, promo: -left, key: `promo_revoked:${g.id}`, reason, createdBy: adminId });
    }
    await tx.promoGrant.update({ where: { id: g.id }, data: { remainingKobo: 0n, revokedAt: new Date() } });
    return { removedKobo: kobo(left) };
  }, { maxWait: 15000, timeout: 20000 });
}

/** Hourly: every grant past its expiry date leaves its wallet. */
export async function expirePromoCredits({ batch = 200 } = {}) {
  const users = await prisma.promoGrant.findMany({ where: { revokedAt: null, remainingKobo: { gt: 0 }, expiresAt: { lte: new Date() } }, select: { userId: true }, distinct: ['userId'], take: batch });
  let n = 0;
  for (const { userId } of users) n += await prisma.$transaction((tx) => expireDue(tx, userId), { maxWait: 15000, timeout: 20000 });
  return { expired: n };
}

/** Campaigns that give every newly verified trader credits. */
export async function grantNewVerifiedCampaigns(userId) {
  const campaigns = await prisma.promoCampaign.findMany({ where: { active: true, audience: 'new_verified' } });
  const out = [];
  for (const c of campaigns) {
    if (c.maxGrants && (await prisma.promoGrant.count({ where: { campaignId: c.id } })) >= c.maxGrants) continue;
    if (await prisma.promoGrant.findFirst({ where: { userId, campaignId: c.id }, select: { id: true } })) continue;
    try {
      out.push(await grantPromo({ userId, amountKobo: c.amountKobo, expiresAt: new Date(Date.now() + c.expiresInDays * DAY), campaignId: c.id, reason: c.name }));
    } catch (err) {
      if (err.code !== 'P2002' && !(err instanceof GameError)) throw err;
    }
  }
  return out;
}

/** The trader's live grants, for the wallet. */
export async function promoGrantsFor(userId) {
  const rows = await prisma.promoGrant.findMany({ where: { userId, revokedAt: null, remainingKobo: { gt: 0 }, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'asc' }, include: { campaign: { select: { name: true } } } });
  return rows.map((g) => ({ id: g.id, name: g.campaign?.name ?? g.reason ?? 'Promotional credits', remainingKobo: kobo(g.remainingKobo), expiresAt: g.expiresAt }));
}
