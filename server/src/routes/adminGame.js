import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { audit } from '../lib/audit.js';
import { CANONICAL_ORIGIN } from '../lib/origins.js';
import { loadGameSettings, sanitizeGameSettings, saveGameSettings, gameSettingsMeta } from '../lib/game/config.js';
import { post, walletFor, walletView, entryView, kobo, HOUSE_WALLET } from '../lib/game/wallet.js';
import { refundMatch, disputeMatch, summary, peopleFor, GameError, LIVE, TX } from '../lib/game/matches.js';
import { TEMPLATES } from '../lib/game/market.js';
import * as pay from '../lib/game/payments/index.js';

// Trading Game administration. Mounted behind requireAuth + requireRole('admin', 'super_admin').
// Admins can review withdrawals and mark disputes; super admins change
// settings, refund matches and adjust wallets. Everything is audited.
export const adminGameRouter = Router();

const superOnly = (req, res, next) => (req.user.role === 'super_admin' ? next() : res.status(403).json({ error: 'Only a super admin can do that.' }));
const since = (days) => new Date(Date.now() - days * 86400e3);
const sum = async (where) => kobo((await prisma.walletEntry.aggregate({ where, _sum: { amountKobo: true } }))._sum.amountKobo);

adminGameRouter.get('/overview', asyncHandler(async (req, res) => {
  const d1 = since(1);
  const d30 = since(30);
  const [house, byStatus, staked1, staked30, fees30, deposits30, withdrawnPaid30, pendingW, disputed] = await Promise.all([
    prisma.wallet.findUnique({ where: { id: HOUSE_WALLET } }),
    prisma.gameMatch.groupBy({ by: ['status'], where: { createdAt: { gte: d30 } }, _count: { _all: true } }),
    sum({ type: 'stake_lock', createdAt: { gte: d1 } }),
    sum({ type: 'stake_lock', createdAt: { gte: d30 } }),
    sum({ type: 'fee', createdAt: { gte: d30 } }),
    sum({ type: 'deposit', createdAt: { gte: d30 } }),
    sum({ type: 'withdrawal_paid', createdAt: { gte: d30 } }),
    prisma.withdrawal.aggregate({ where: { status: { in: ['requested', 'processing'] } }, _sum: { amountKobo: true }, _count: { _all: true } }),
    prisma.gameMatch.count({ where: { status: 'DISPUTED' } }),
  ]);
  const totals = await prisma.wallet.aggregate({ where: { kind: 'user' }, _sum: { availableKobo: true, lockedKobo: true, pendingWithdrawKobo: true } });
  res.json({
    houseKobo: kobo(house?.availableKobo),
    playerFunds: { availableKobo: kobo(totals._sum.availableKobo), lockedKobo: kobo(totals._sum.lockedKobo), pendingWithdrawKobo: kobo(totals._sum.pendingWithdrawKobo) },
    stakedTodayKobo: staked1,
    staked30dKobo: staked30,
    fees30dKobo: fees30,
    deposits30dKobo: deposits30,
    withdrawalsPaid30dKobo: withdrawnPaid30,
    pendingWithdrawals: { count: pendingW._count._all, amountKobo: kobo(pendingW._sum.amountKobo) },
    disputed,
    matches30d: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
  });
}));

adminGameRouter.get('/settings', asyncHandler(async (req, res) => {
  const settings = await loadGameSettings();
  const [providers] = await Promise.all([pay.providers()]);
  res.json({
    settings,
    meta: gameSettingsMeta(),
    canEdit: req.user.role === 'super_admin',
    markets: TEMPLATES.map((t) => ({ key: t.key, name: t.name })),
    providers: { whop: !!providers.whop, whopWebhook: !!providers.whop?.webhookSecret, paystack: !!providers.paystack },
    webhooks: { whop: `${CANONICAL_ORIGIN}/api/game/webhooks/whop`, paystack: `${CANONICAL_ORIGIN}/api/game/webhooks/paystack` },
  });
}));

adminGameRouter.put('/settings', superOnly, asyncHandler(async (req, res) => {
  const current = await loadGameSettings();
  const { settings, error } = sanitizeGameSettings(req.body ?? {}, current);
  if (error) return res.status(400).json({ error });
  const changed = Object.fromEntries(Object.keys(settings).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(current[k])).map((k) => [k, { from: current[k], to: settings[k] }]));
  const saved = await saveGameSettings(settings, req.user.id);
  if (Object.keys(changed).length) await audit(req, 'game.settings_updated', { targetType: 'game_settings', targetId: 'singleton', detail: changed });
  res.json({ settings: saved });
}));

// ── Withdrawals ─────────────────────────────────────────────────────────────

adminGameRouter.get('/withdrawals', asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const rows = await prisma.withdrawal.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { id: true, name: true, email: true } } } });
  const accounts = await prisma.payoutAccount.findMany({ where: { id: { in: rows.map((r) => r.payoutAccountId).filter(Boolean) } } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  res.json({
    withdrawals: rows.map((w) => {
      const a = byId.get(w.payoutAccountId);
      return { ...pay.withdrawalView(w), failureReason: w.failureReason, user: w.user, reviewNote: w.reviewNote, reviewedAt: w.reviewedAt, providerRef: w.providerRef, account: a ? { bankName: a.bankName, accountLast4: a.accountLast4, accountName: a.accountName, nameMatchesId: a.nameMatchesId, externalId: a.externalId } : null };
    }),
  });
}));

adminGameRouter.post('/withdrawals/:id/approve', asyncHandler(async (req, res) => {
  const w = await pay.processWithdrawal(req.params.id, req.user.id);
  await audit(req, 'game.withdrawal_approved', { targetType: 'withdrawal', targetId: w.id, detail: { amountKobo: w.amountKobo, status: w.status } });
  res.json({ withdrawal: w });
}));

adminGameRouter.post('/withdrawals/:id/reject', asyncHandler(async (req, res) => {
  const note = String(req.body?.note ?? '').trim().slice(0, 300);
  if (note.length < 3) return res.status(400).json({ error: 'Say why, so the trader understands.' });
  const w = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
  if (!w || w.status !== 'requested') return res.status(409).json({ error: 'Only a withdrawal waiting for review can be rejected.' });
  await pay.markFailed(w.id, note, 'rejected', req.user.id);
  await audit(req, 'game.withdrawal_rejected', { targetType: 'withdrawal', targetId: w.id, detail: { amountKobo: kobo(w.amountKobo), note } });
  res.json({ ok: true });
}));

// When the provider's answer never arrived: confirm what the provider's dashboard shows.
adminGameRouter.post('/withdrawals/:id/resolve', superOnly, asyncHandler(async (req, res) => {
  const outcome = req.body?.outcome;
  const note = String(req.body?.note ?? '').trim().slice(0, 300);
  const w = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
  if (!w || w.status !== 'processing') return res.status(409).json({ error: 'Only a withdrawal being processed can be resolved by hand.' });
  if (!['paid', 'failed'].includes(outcome) || note.length < 3) return res.status(400).json({ error: 'Choose paid or failed, and note what the provider shows.' });
  if (outcome === 'paid') await pay.markPaid(w.id);
  else await pay.markFailed(w.id, note, 'failed', req.user.id);
  await audit(req, 'game.withdrawal_resolved', { targetType: 'withdrawal', targetId: w.id, detail: { outcome, note, amountKobo: kobo(w.amountKobo) } });
  res.json({ ok: true });
}));

adminGameRouter.get('/deposits', asyncHandler(async (req, res) => {
  const rows = await prisma.deposit.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { id: true, name: true, email: true } } } });
  res.json({ deposits: rows.map((d) => ({ ...pay.depositView(d), failureReason: d.failureReason, providerRef: d.providerRef, providerPaymentId: d.providerPaymentId, user: d.user })) });
}));

// ── Matches ─────────────────────────────────────────────────────────────────

adminGameRouter.get('/matches', asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const rows = await prisma.gameMatch.findMany({ where: status === 'live' ? { status: { in: LIVE } } : status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { players: { select: { userId: true, score: true, outcome: true, returnPct: true } } } });
  const people = await peopleFor(rows.flatMap((m) => [m.creatorId, m.invitedUserId, ...m.players.map((p) => p.userId)]));
  res.json({ matches: rows.map((m) => ({ ...summary(m, people), scenario: { code: m.scenarioCode, key: m.scenario, name: TEMPLATES.find((t) => t.key === m.scenario)?.name }, flags: m.flags, players: m.players.map((p) => ({ ...p, name: people.get(p.userId)?.name })) })) });
}));

adminGameRouter.post('/matches/:id/dispute', asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
  if (reason.length < 3) return res.status(400).json({ error: 'Say why the match is disputed.' });
  await disputeMatch(req.user.id, req.params.id, reason);
  await audit(req, 'game.match_disputed', { targetType: 'match', targetId: req.params.id, detail: { reason } });
  res.json({ ok: true });
}));

adminGameRouter.post('/matches/:id/refund', superOnly, asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
  if (reason.length < 3) return res.status(400).json({ error: 'Say why the stakes are being returned.' });
  await refundMatch(req.user.id, req.params.id, reason);
  await audit(req, 'game.match_refunded', { targetType: 'match', targetId: req.params.id, detail: { reason } });
  res.json({ ok: true });
}));

// ── Wallets and the ledger ──────────────────────────────────────────────────

adminGameRouter.get('/wallets', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ wallets: [] });
  const users = await prisma.user.findMany({ where: { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] }, select: { id: true, name: true, email: true, wallet: true }, take: 20 });
  res.json({ wallets: users.map((u) => ({ user: { id: u.id, name: u.name, email: u.email }, wallet: walletView(u.wallet) })) });
}));

adminGameRouter.get('/ledger', asyncHandler(async (req, res) => {
  const where = {};
  if (typeof req.query.userId === 'string' && req.query.userId) where.userId = req.query.userId;
  if (req.query.house === '1') where.walletId = HOUSE_WALLET;
  if (typeof req.query.type === 'string' && req.query.type) where.type = req.query.type;
  const rows = await prisma.walletEntry.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  const people = await peopleFor(rows.map((r) => r.userId));
  res.json({ entries: rows.map((e) => ({ ...entryView(e), userName: people.get(e.userId)?.name ?? (e.walletId === HOUSE_WALLET ? 'Kotka (fees)' : null), idempotencyKey: e.idempotencyKey, createdBy: e.createdBy })) });
}));

// A correction to a person's available balance, with a reason. Positive adds, negative removes.
adminGameRouter.post('/adjustments', superOnly, asyncHandler(async (req, res) => {
  const amount = Number(req.body?.amountKobo);
  const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
  const userId = String(req.body?.userId ?? '');
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000_000) return res.status(400).json({ error: 'Enter a whole amount in kobo, positive to add or negative to remove, up to ₦1,000,000.' });
  if (reason.length < 5) return res.status(400).json({ error: 'Explain the adjustment; it’s kept in the ledger.' });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new GameError('We couldn’t find that person.', 404);
  const entry = await prisma.$transaction(async (tx) => {
    const w = await walletFor(user.id, tx);
    return (await post(tx, { walletId: w.id, userId: user.id, type: 'adjustment', amount: Math.abs(amount), available: amount, key: `adjustment:${crypto.randomUUID()}`, reason, createdBy: req.user.id })).entry;
  }, TX);
  await audit(req, 'game.wallet_adjusted', { targetType: 'user', targetId: user.id, detail: { amountKobo: amount, reason } });
  res.status(201).json({ entry: entryView(entry) });
}));
