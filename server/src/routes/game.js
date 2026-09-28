import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { limit } from '../lib/rateLimit.js';
import { auditLater } from '../lib/audit.js';
import { loadGameSettings, publicGameRules } from '../lib/game/config.js';
import { walletFor, walletView, entryView, stakedToday } from '../lib/game/wallet.js';
import { createMatch, joinMatch, confirmMatch, cancelMatch, act, matchView, lobby, history, rematch, GameError } from '../lib/game/matches.js';
import { profileFor } from '../lib/game/progression.js';
import { TEMPLATES } from '../lib/game/market.js';
import * as pay from '../lib/game/payments/index.js';

// The Trading Game for players. Money routes need a verified identity
// (checked in the services); practice matches don't.
export const gameRouter = Router();
gameRouter.use(requireAuth);

const me = async (req) => prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true, username: true } });
const int = (v) => (Number.isInteger(v) ? v : Number.isInteger(Number(v)) && String(v).trim() !== '' ? Number(v) : NaN);

gameRouter.get('/home', asyncHandler(async (req, res) => {
  const user = await me(req);
  const [s, wallet, lists, profile, p, kyc, today] = await Promise.all([loadGameSettings(), walletFor(user.id), lobby(user), profileFor(user.id), pay.providers(), prisma.kycProfile.findUnique({ where: { userId: user.id }, select: { status: true } }), stakedToday(user.id)]);
  res.json({
    rules: publicGameRules(s),
    wallet: walletView(wallet),
    stakedTodayKobo: today,
    ...lists,
    profile,
    providers: p.list,
    identityVerified: kyc?.status === 'approved',
    markets: TEMPLATES.map((t) => ({ key: t.key, name: t.name })),
  });
}));

// ── Wallet ──────────────────────────────────────────────────────────────────

gameRouter.get('/wallet', asyncHandler(async (req, res) => {
  const user = await me(req);
  const [wallet, entries, deposits, withdrawals, payout, s] = await Promise.all([
    walletFor(user.id),
    prisma.walletEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    pay.payoutStatus(user),
    loadGameSettings(),
  ]);
  res.json({ wallet: walletView(wallet), entries: entries.map(entryView), deposits: deposits.map(pay.depositView), withdrawals: withdrawals.map(pay.withdrawalView), payout, rules: publicGameRules(s) });
}));

gameRouter.post('/wallet/deposits', limit('deposit'), asyncHandler(async (req, res) => {
  const user = await me(req);
  const r = await pay.startDeposit(user, { amountKobo: int(req.body?.amountKobo), provider: req.body?.provider });
  auditLater(req, 'game.deposit_started', { targetType: 'deposit', targetId: r.deposit.id, detail: { amountKobo: r.deposit.amountKobo, provider: r.deposit.provider } });
  res.status(201).json(r);
}));

gameRouter.post('/wallet/deposits/:id/check', limit('depositCheck'), asyncHandler(async (req, res) => {
  res.json({ deposit: await pay.refreshDeposit(await me(req), req.params.id) });
}));

gameRouter.post('/wallet/payout/whop', limit('payoutSetup'), asyncHandler(async (req, res) => {
  const link = await pay.whopOnboardingLink(await me(req), req.body?.use === 'payouts_portal' ? 'payouts_portal' : 'account_onboarding');
  res.json(link);
}));

gameRouter.get('/wallet/payout/paystack/banks', asyncHandler(async (req, res) => {
  res.json({ banks: await pay.paystackBanks() });
}));

gameRouter.post('/wallet/payout/paystack', limit('payoutSetup'), asyncHandler(async (req, res) => {
  const r = await pay.setPaystackAccount(await me(req), { bankCode: String(req.body?.bankCode ?? ''), accountNumber: String(req.body?.accountNumber ?? '') });
  auditLater(req, 'game.payout_account_set', { targetType: 'user', targetId: req.userId, detail: { provider: 'paystack', nameMatchesId: r.nameMatchesId } });
  res.json(r);
}));

gameRouter.post('/wallet/withdrawals', limit('withdrawal'), asyncHandler(async (req, res) => {
  const w = await pay.requestWithdrawal(await me(req), { amountKobo: int(req.body?.amountKobo), provider: req.body?.provider });
  auditLater(req, 'game.withdrawal_requested', { targetType: 'withdrawal', targetId: w.id, detail: { amountKobo: w.amountKobo, provider: w.provider } });
  res.status(201).json({ withdrawal: w });
}));

gameRouter.post('/wallet/withdrawals/:id/cancel', asyncHandler(async (req, res) => {
  res.json({ withdrawal: await pay.cancelWithdrawal(await me(req), req.params.id) });
}));

// ── Matches ─────────────────────────────────────────────────────────────────

// Opponents to challenge: other active traders, by username or name.
gameRouter.get('/traders', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 60);
  if (q.length < 2) return res.json({ traders: [] });
  const traders = await prisma.user.findMany({
    where: { id: { not: req.userId }, status: 'active', OR: [{ username: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] },
    select: { id: true, name: true, username: true, initials: true, avatarId: true, gameProfile: { select: { level: true } } },
    take: 10,
  });
  res.json({ traders: traders.map((t) => ({ id: t.id, name: t.name, username: t.username, initials: t.initials, avatarId: t.avatarId, level: t.gameProfile?.level ?? 1 })) });
}));

gameRouter.post('/matches', limit('gameCreate'), asyncHandler(async (req, res) => {
  const user = await me(req);
  const b = req.body ?? {};
  const mode = b.mode === 'practice' ? 'practice' : 'duel';
  const m = await createMatch(user, { mode, stakeKobo: int(b.stakeKobo), durationSec: b.durationSec === undefined ? undefined : int(b.durationSec), opponentId: typeof b.opponentId === 'string' ? b.opponentId : null, open: b.open === true });
  if (mode === 'duel') auditLater(req, 'game.challenge_created', { targetType: 'match', targetId: m.id, detail: { stakeKobo: Number(m.stakeKobo), open: m.isOpen } });
  res.status(201).json({ match: { id: m.id } });
}));

gameRouter.get('/matches/:id/state', asyncHandler(async (req, res) => {
  const since = Math.max(0, int(req.query.since) || 0);
  res.json(await matchView({ id: req.userId }, req.params.id, { since }));
}));

gameRouter.post('/matches/:id/join', limit('gameCreate'), asyncHandler(async (req, res) => {
  const m = await joinMatch(await me(req), req.params.id);
  auditLater(req, 'game.challenge_accepted', { targetType: 'match', targetId: m.id });
  res.json({ ok: true });
}));

gameRouter.post('/matches/:id/confirm', asyncHandler(async (req, res) => {
  await confirmMatch({ id: req.userId }, req.params.id);
  res.json(await matchView({ id: req.userId }, req.params.id));
}));

gameRouter.post('/matches/:id/cancel', asyncHandler(async (req, res) => {
  await cancelMatch({ id: req.userId }, req.params.id);
  res.json({ ok: true });
}));

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
gameRouter.post('/matches/:id/actions', limit('gameAction'), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const key = req.get('idempotency-key');
  await act({ id: req.userId }, req.params.id, { type: String(b.type ?? ''), payload: b.payload ?? {}, requestKey: key && KEY_RE.test(key) ? key : null, clientTick: Number.isInteger(b.clientTick) ? b.clientTick : undefined });
  res.json(await matchView({ id: req.userId }, req.params.id, { since: Math.max(0, int(b.since) || 0) }));
}));

gameRouter.post('/matches/:id/rematch', limit('gameCreate'), asyncHandler(async (req, res) => {
  const m = await rematch(await me(req), req.params.id);
  res.status(201).json({ match: { id: m.id } });
}));

gameRouter.get('/history', asyncHandler(async (req, res) => {
  res.json(await history(req.userId, { cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined }));
}));

gameRouter.get('/profile', asyncHandler(async (req, res) => {
  res.json({ profile: await profileFor(req.userId) });
}));

// Another trader's record: quality, not money.
gameRouter.get('/traders/:username', asyncHandler(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { username: String(req.params.username) }, select: { id: true, name: true, username: true, initials: true, avatarId: true, status: true } });
  if (!u || u.status !== 'active') throw new GameError('We couldn’t find that trader.', 404);
  const { totalStakedKobo, totalWonKobo, ...p } = await profileFor(u.id); // eslint-disable-line no-unused-vars
  res.json({ trader: { id: u.id, name: u.name, username: u.username, initials: u.initials, avatarId: u.avatarId }, profile: p });
}));

// ── Webhooks (no session: signed by the provider) ───────────────────────────
// Mounted with a raw body parser in app.js.
export const gameWebhookRouter = Router();

gameWebhookRouter.post('/whop', asyncHandler(async (req, res) => {
  const headers = { 'webhook-id': req.get('webhook-id'), 'webhook-timestamp': req.get('webhook-timestamp'), 'webhook-signature': req.get('webhook-signature') };
  const r = await pay.handleWhopWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.from(''), headers);
  res.status(r.status).json(r.body);
}));

gameWebhookRouter.post('/paystack', asyncHandler(async (req, res) => {
  const r = await pay.handlePaystackWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.from(''), req.get('x-paystack-signature'));
  res.status(r.status).json(r.body);
}));
