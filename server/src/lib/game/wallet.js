// The wallet ledger. Every change to a balance:
//   - happens inside a database transaction,
//   - locks the wallet row first (SELECT ... FOR UPDATE), so two requests
//     can't both spend the same money,
//   - writes one WalletEntry with the balances before and after,
//   - carries an idempotency key, so the same movement (a replayed
//     webhook, a second settlement attempt) can happen only once.
// Balances never go below zero; a movement that would is refused.
// Amounts are BigInt kobo inside, plain numbers (kobo) at the API edge.

import { prisma } from '../prisma.js';

export const HOUSE_WALLET = 'house';
export class InsufficientFunds extends Error {
  constructor(message = 'You don’t have enough available balance for that.') {
    super(message);
    this.expose = true;
    this.status = 400;
  }
}

const big = (v) => (typeof v === 'bigint' ? v : BigInt(Math.round(Number(v) || 0)));
export const kobo = (v) => Number(v ?? 0);

// The person's wallet, created on first use.
export async function walletFor(userId, db = prisma) {
  const existing = await db.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return db.wallet.upsert({ where: { userId }, update: {}, create: { userId, kind: 'user' } });
}

export const RESTRICTED_EXPLAINED = 'Part of your balance was won with promotional credits. It can be withdrawn once you’ve staked the same amount of your own money in competitions.';

/**
 * post(tx, { walletId, type, amount, available, locked, pending, promo,
 *            promoLocked, restricted, key, ... })
 * All movement fields are signed deltas (kobo). promo/promoLocked move
 * promotional credits; restricted moves the part of `available` won with
 * them, which can't be withdrawn yet. Must run inside prisma.$transaction.
 * Returns { entry, wallet, duplicate }.
 */
export async function post(tx, { walletId, userId = null, type, amount, available = 0, locked = 0, pending = 0, promo = 0, promoLocked = 0, restricted = 0, key, creditType = 'cash', matchId = null, depositId = null, withdrawalId = null, reason = null, createdBy = null }) {
  if (!key) throw new Error('Every ledger entry needs an idempotency key.');
  const [w] = await tx.$queryRaw`SELECT * FROM "Wallet" WHERE "id" = ${walletId} FOR UPDATE`;
  if (!w) throw new Error(`Wallet ${walletId} not found.`);
  const seen = await tx.walletEntry.findUnique({ where: { idempotencyKey: key } });
  if (seen) return { entry: seen, wallet: w, duplicate: true };
  const dA = big(available);
  const dL = big(locked);
  const dP = big(pending);
  const dPr = big(promo);
  const dPrL = big(promoLocked);
  const dR = big(restricted);
  const next = {
    availableKobo: w.availableKobo + dA,
    lockedKobo: w.lockedKobo + dL,
    pendingWithdrawKobo: w.pendingWithdrawKobo + dP,
    promoAvailableKobo: w.promoAvailableKobo + dPr,
    promoLockedKobo: w.promoLockedKobo + dPrL,
    restrictedKobo: w.restrictedKobo + dR,
  };
  // Kotka's own (house) wallet pays for promotions, so it alone may go below zero, and only for that.
  // Money coming in (a fee) is always accepted, even while the house is below zero.
  const houseCost = w.kind === 'house' && type === 'promo_cost';
  if (next.availableKobo < 0n && dA < 0n && !houseCost) throw new InsufficientFunds();
  if (next.availableKobo < 0n && w.kind !== 'house') throw new InsufficientFunds();
  if (next.promoAvailableKobo < 0n) throw new InsufficientFunds('You don’t have enough promotional credits for that.');
  if (next.lockedKobo < 0n || next.pendingWithdrawKobo < 0n || next.promoLockedKobo < 0n || next.restrictedKobo < 0n) throw new Error(`Ledger would go negative on wallet ${walletId} (${type}).`);
  // Restricted winnings are part of the available balance: money can leave
  // `available` only down to what's restricted.
  if (next.restrictedKobo > next.availableKobo && w.kind !== 'house') {
    if (dA < 0n && dR === 0n) throw new InsufficientFunds(RESTRICTED_EXPLAINED);
    throw new Error(`Restricted winnings would exceed the available balance on wallet ${walletId} (${type}).`);
  }
  const wallet = await tx.wallet.update({ where: { id: walletId }, data: next });
  const entry = await tx.walletEntry.create({
    data: {
      walletId,
      userId: userId ?? w.userId,
      type,
      creditType,
      amountKobo: big(amount),
      availableDelta: dA,
      lockedDelta: dL,
      pendingDelta: dP,
      availableBefore: w.availableKobo,
      availableAfter: next.availableKobo,
      lockedBefore: w.lockedKobo,
      lockedAfter: next.lockedKobo,
      pendingBefore: w.pendingWithdrawKobo,
      pendingAfter: next.pendingWithdrawKobo,
      promoDelta: dPr,
      promoLockedDelta: dPrL,
      restrictedDelta: dR,
      promoBefore: w.promoAvailableKobo,
      promoAfter: next.promoAvailableKobo,
      promoLockedBefore: w.promoLockedKobo,
      promoLockedAfter: next.promoLockedKobo,
      restrictedBefore: w.restrictedKobo,
      restrictedAfter: next.restrictedKobo,
      matchId,
      depositId,
      withdrawalId,
      reason,
      idempotencyKey: key,
      createdBy,
    },
  });
  return { entry, wallet, duplicate: false };
}

export function walletView(w) {
  const available = kobo(w?.availableKobo);
  const locked = kobo(w?.lockedKobo);
  const pending = kobo(w?.pendingWithdrawKobo);
  const restricted = kobo(w?.restrictedKobo);
  return {
    availableKobo: available,
    lockedKobo: locked,
    pendingWithdrawKobo: pending,
    totalKobo: available + locked + pending,
    // Real money you can take out now: available, less winnings still tied to promotional credits.
    withdrawableKobo: Math.max(0, available - restricted),
    restrictedKobo: restricted,
    promoAvailableKobo: kobo(w?.promoAvailableKobo),
    promoLockedKobo: kobo(w?.promoLockedKobo),
    onHold: !!w?.frozenAt,
    holdReason: w?.frozenAt ? w.frozenReason ?? null : null,
  };
}

const TYPE_LABEL = {
  deposit: 'Deposit',
  stake_lock: 'Stake locked for a match',
  stake_release: 'Stake returned',
  stake_debit: 'Stake entered the prize pool',
  winnings: 'Competition winnings',
  draw_return: 'Draw: your share of the pool',
  refund: 'Refund',
  fee: 'Kotka fee',
  withdrawal_hold: 'Withdrawal requested',
  withdrawal_release: 'Withdrawal returned to your balance',
  withdrawal_paid: 'Withdrawal paid',
  withdrawal_reversed: 'Withdrawal sent back by the bank: returned to your balance',
  adjustment: 'Adjustment',
  promo_credit: 'Promotional credits added',
  promo_expired: 'Promotional credits expired',
  promo_revoked: 'Promotional credits removed',
  promo_cost: 'Promotion paid by Kotka',
};

export function entryView(e) {
  return {
    id: e.id,
    type: e.type,
    label: TYPE_LABEL[e.type] ?? e.type,
    creditType: e.creditType,
    amountKobo: kobo(e.amountKobo),
    availableDeltaKobo: kobo(e.availableDelta),
    lockedDeltaKobo: kobo(e.lockedDelta),
    pendingDeltaKobo: kobo(e.pendingDelta),
    availableAfterKobo: kobo(e.availableAfter),
    lockedAfterKobo: kobo(e.lockedAfter),
    promoDeltaKobo: kobo(e.promoDelta),
    promoLockedDeltaKobo: kobo(e.promoLockedDelta),
    restrictedDeltaKobo: kobo(e.restrictedDelta),
    promoAfterKobo: kobo(e.promoAfter),
    status: e.status,
    matchId: e.matchId,
    depositId: e.depositId,
    withdrawalId: e.withdrawalId,
    reason: e.reason,
    createdAt: e.createdAt,
  };
}

// Stakes locked today (UTC), for the daily stake limit.
export async function stakedToday(userId, db = prisma) {
  const d = new Date();
  const since = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const agg = await db.walletEntry.aggregate({ where: { userId, type: 'stake_lock', createdAt: { gte: since } }, _sum: { amountKobo: true } });
  return kobo(agg._sum.amountKobo);
}
