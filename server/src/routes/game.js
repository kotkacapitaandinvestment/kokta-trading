import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { limit } from '../lib/rateLimit.js';
import { auditLater } from '../lib/audit.js';
import { loadGameSettings, publicGameRules } from '../lib/game/config.js';
import { walletFor, walletView, entryView, stakedToday } from '../lib/game/wallet.js';
import { createMatch, joinMatch, confirmMatch, cancelMatch, act, matchView, chartCandles, lobby, history, rematch, personOf, GameError, closeOpenFor } from '../lib/game/matches.js';
import { promoGrantsFor } from '../lib/game/promo.js';
import { limitsFor, limitsView, setLimits, takeBreak } from '../lib/game/limits.js';
import { PAIRS, publicPair } from '../lib/game/pairs.js';
import { profileFor } from '../lib/game/progression.js';
import * as arena from '../lib/game/arena.js';
import { learnData } from '../lib/game/learn.js';
import { TEMPLATES } from '../lib/game/market.js';
import * as pay from '../lib/game/payments/index.js';
import { confirmWithTwoStep } from '../lib/totp.js';

// The Trading Game for players. Money routes need a verified identity
// (checked in the services); practice matches don't.
export const gameRouter = Router();
gameRouter.use(requireAuth);

const me = async (req) => prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true, username: true } });
const int = (v) => (Number.isInteger(v) ? v : Number.isInteger(Number(v)) && String(v).trim() !== '' ? Number(v) : NaN);

gameRouter.get('/home', asyncHandler(async (req, res) => {
  const user = await me(req);
  arena.touch(user.id);
  const [s, wallet, lists, profile, p, kyc, today, stats, ready, board, recent, featured, presence, queue] = await Promise.all([
    loadGameSettings(),
    walletFor(user.id),
    lobby(user),
    profileFor(user.id),
    pay.providers(),
    prisma.kycProfile.findUnique({ where: { userId: user.id }, select: { status: true } }),
    stakedToday(user.id),
    arena.arenaStats(),
    arena.readyTraders(user),
    arena.openBoard(user),
    arena.recentResults(6),
    arena.leaderboard('week'),
    arena.presenceOf(user.id),
    arena.queueStatus(user),
  ]);
  res.json({
    arena: { stats, readyTraders: ready, board, recentResults: recent, featured: featured.slice(0, 3), me: { ready: presence.ready, queue } },
    rules: publicGameRules(s),
    wallet: walletView(wallet),
    stakedTodayKobo: today,
    ...lists,
    profile,
    providers: p.list,
    identityVerified: kyc?.status === 'approved',
    markets: TEMPLATES.map((t) => ({ key: t.key, name: t.name })),
    pairs: PAIRS.filter((p) => s.pairs.includes(p.symbol)).map(publicPair),
  });
}));

// ── Wallet ──────────────────────────────────────────────────────────────────

gameRouter.get('/wallet', asyncHandler(async (req, res) => {
  const user = await me(req);
  arena.touch(user.id);
  const [wallet, entries, deposits, withdrawals, payout, s, promo, limits] = await Promise.all([
    walletFor(user.id),
    prisma.walletEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    pay.payoutStatus(user),
    loadGameSettings(),
    promoGrantsFor(user.id),
    limitsFor(user.id),
  ]);
  res.json({ wallet: walletView(wallet), promo, limits: limitsView(limits), entries: entries.map(entryView), deposits: deposits.map(pay.depositView), withdrawals: withdrawals.map(pay.withdrawalView), payout, rules: publicGameRules(s) });
}));

// ── Responsible play: the trader's own limits and breaks ────────────────────

gameRouter.put('/limits', limit('profile'), asyncHandler(async (req, res) => {
  const r = await setLimits(req.userId, req.body ?? {});
  auditLater(req, 'game.limits_changed', { targetType: 'user', targetId: req.userId, detail: { applied: r.applied, waiting24h: r.pending } });
  res.json(r);
}));

gameRouter.post('/limits/break', limit('profile'), asyncHandler(async (req, res) => {
  const r = await takeBreak(req.userId, String(req.body?.kind ?? ''));
  // Open challenges close and any search stops; a match already running finishes.
  await closeOpenFor(req.userId, r.exclusion ? 'self-excluded' : 'taking a break');
  await arena.setReady({ id: req.userId }, false).catch(() => {});
  auditLater(req, r.exclusion ? 'game.self_excluded' : 'game.break_started', { targetType: 'user', targetId: req.userId, detail: { kind: req.body?.kind, until: r.until } });
  res.json(r);
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

// Money leaving Kotka, and where it goes, needs a fresh code from the
// trader's authenticator app: a stolen password alone can't move it.
const twoStep = asyncHandler(async (req, res, next) => {
  const problem = await confirmWithTwoStep(req.userId, req.body?.twoStepCode);
  if (problem) return res.status(problem.status).json({ error: problem.error, code: problem.code });
  next();
});

gameRouter.post('/wallet/payout/whop', limit('payoutSetup'), twoStep, asyncHandler(async (req, res) => {
  const link = await pay.whopOnboardingLink(await me(req), req.body?.use === 'payouts_portal' ? 'payouts_portal' : 'account_onboarding');
  res.json(link);
}));

gameRouter.get('/wallet/payout/paystack/banks', asyncHandler(async (req, res) => {
  res.json({ banks: await pay.paystackBanks() });
}));

gameRouter.post('/wallet/payout/paystack', limit('payoutSetup'), twoStep, asyncHandler(async (req, res) => {
  const r = await pay.setPaystackAccount(await me(req), { bankCode: String(req.body?.bankCode ?? ''), accountNumber: String(req.body?.accountNumber ?? '') });
  auditLater(req, 'game.payout_account_set', { targetType: 'user', targetId: req.userId, detail: { provider: 'paystack', nameMatchesId: r.nameMatchesId } });
  res.json(r);
}));

gameRouter.post('/wallet/withdrawals', limit('withdrawal'), twoStep, asyncHandler(async (req, res) => {
  const w = await pay.requestWithdrawal(await me(req), { amountKobo: int(req.body?.amountKobo), provider: req.body?.provider });
  auditLater(req, 'game.withdrawal_requested', { targetType: 'withdrawal', targetId: w.id, detail: { amountKobo: w.amountKobo, provider: w.provider } });
  res.status(201).json({ withdrawal: w });
}));

gameRouter.post('/wallet/withdrawals/:id/cancel', limit('gameLobby'), asyncHandler(async (req, res) => {
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
  const m = await createMatch(user, { mode, stakeKobo: int(b.stakeKobo), durationSec: b.durationSec === undefined ? undefined : int(b.durationSec), opponentId: typeof b.opponentId === 'string' ? b.opponentId : null, open: b.open === true, symbol: typeof b.symbol === 'string' && b.symbol ? b.symbol : null });
  if (mode === 'duel') auditLater(req, 'game.challenge_created', { targetType: 'match', targetId: m.id, detail: { stakeKobo: Number(m.stakeKobo), open: m.isOpen } });
  res.status(201).json({ match: { id: m.id } });
}));

gameRouter.get('/matches/:id/state', asyncHandler(async (req, res) => {
  const ticksSince = req.query.ticksSince !== undefined ? int(req.query.ticksSince) : NaN;
  const since = req.query.since !== undefined ? Math.max(0, int(req.query.since) || 0) : null;
  res.json(await matchView({ id: req.userId }, req.params.id, { since, ticksSince: Number.isInteger(ticksSince) ? ticksSince : null }));
}));

// Candles for the chart at any timeframe, older pages as you scroll back.
gameRouter.get('/matches/:id/candles', asyncHandler(async (req, res) => {
  const before = req.query.before !== undefined ? int(req.query.before) : null;
  const until = req.query.until !== undefined ? int(req.query.until) : null;
  res.json(await chartCandles({ id: req.userId }, req.params.id, { tf: int(req.query.tf), before: Number.isInteger(before) ? before : null, until: Number.isInteger(until) ? until : null, limit: int(req.query.limit) || 300 }));
}));

// The Kotka pairs (synthetic) people can trade.
gameRouter.get('/pairs', asyncHandler(async (req, res) => {
  const s = await loadGameSettings();
  res.json({ pairs: PAIRS.filter((p) => s.pairs.includes(p.symbol)).map(publicPair) });
}));

// A trader's saved chart (drawings, timeframe, indicators) for one match.
const SCOPE_RE = /^match:[a-z0-9]{10,40}$/;
gameRouter.get('/charts/:scope', asyncHandler(async (req, res) => {
  if (!SCOPE_RE.test(req.params.scope)) return res.status(400).json({ error: 'That chart doesn’t exist.' });
  const row = await prisma.gameChartLayout.findUnique({ where: { userId_scope: { userId: req.userId, scope: req.params.scope } } });
  res.json({ layout: row?.data ?? null });
}));

gameRouter.put('/charts/:scope', limit('chartSave'), asyncHandler(async (req, res) => {
  if (!SCOPE_RE.test(req.params.scope)) return res.status(400).json({ error: 'That chart doesn’t exist.' });
  const data = req.body?.layout;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Nothing to save.' });
  const size = JSON.stringify(data).length;
  if (size > 200_000) return res.status(413).json({ error: 'That chart has too many drawings to save. Remove a few and try again.' });
  if (Array.isArray(data.drawings) && data.drawings.length > 300) return res.status(413).json({ error: 'Charts can hold up to 300 drawings.' });
  const matchId = req.params.scope.slice('match:'.length);
  const inMatch = await prisma.gamePlayer.findUnique({ where: { matchId_userId: { matchId, userId: req.userId } } });
  if (!inMatch) return res.status(404).json({ error: 'That chart doesn’t exist.' });
  await prisma.gameChartLayout.upsert({ where: { userId_scope: { userId: req.userId, scope: req.params.scope } }, update: { data }, create: { userId: req.userId, scope: req.params.scope, data } });
  res.json({ ok: true });
}));

gameRouter.post('/matches/:id/join', limit('gameCreate'), asyncHandler(async (req, res) => {
  const m = await joinMatch(await me(req), req.params.id);
  auditLater(req, 'game.challenge_accepted', { targetType: 'match', targetId: m.id });
  res.json({ ok: true });
}));

gameRouter.post('/matches/:id/confirm', limit('gameLobby'), asyncHandler(async (req, res) => {
  await confirmMatch({ id: req.userId }, req.params.id);
  res.json(await matchView({ id: req.userId }, req.params.id));
}));

gameRouter.post('/matches/:id/cancel', limit('gameLobby'), asyncHandler(async (req, res) => {
  await cancelMatch({ id: req.userId }, req.params.id);
  res.json({ ok: true });
}));

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
gameRouter.post('/matches/:id/actions', limit('gameAction'), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const key = req.get('idempotency-key');
  await act({ id: req.userId }, req.params.id, { type: String(b.type ?? ''), payload: b.payload ?? {}, requestKey: key && KEY_RE.test(key) ? key : null, clientTick: Number.isInteger(b.clientTick) ? b.clientTick : undefined });
  // The new chart asks for one-second prices; older app versions for candles.
  const ticksSince = Number.isInteger(b.ticksSince) ? b.ticksSince : null;
  res.json(await matchView({ id: req.userId }, req.params.id, ticksSince !== null ? { ticksSince } : { since: Math.max(0, int(b.since) || 0) }));
}));

gameRouter.post('/matches/:id/rematch', limit('gameCreate'), asyncHandler(async (req, res) => {
  const m = await rematch(await me(req), req.params.id);
  res.status(201).json({ match: { id: m.id } });
}));

gameRouter.get('/history', asyncHandler(async (req, res) => {
  arena.touch(req.userId);
  res.json(await history(req.userId, { cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined }));
}));

gameRouter.get('/profile', asyncHandler(async (req, res) => {
  res.json({ profile: await profileFor(req.userId) });
}));

// Another trader's record: quality, not money.
gameRouter.get('/traders/:username', asyncHandler(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { username: String(req.params.username) }, select: { id: true, name: true, username: true, initials: true, avatarId: true, status: true } });
  if (!u || u.status !== 'active') throw new GameError('We couldn’t find that trader.', 404);
  const [{ totalStakedKobo, totalWonKobo, ...p }, recent, dna, presence] = await Promise.all([profileFor(u.id), arena.publicMatches(u.id), arena.traderDna(u.id), arena.presenceOf(u.id)]); // eslint-disable-line no-unused-vars
  res.json({ trader: { ...personOf(u), ...presence, self: u.id === req.userId }, profile: p, recent, dna });
}));

// ── Trading Arena ───────────────────────────────────────────────────────────

// Ready to Trade: others in the Arena can see you and challenge you.
gameRouter.post('/ready', limit('gameReady'), asyncHandler(async (req, res) => {
  res.json(await arena.setReady(await me(req), req.body?.on === true));
}));

// Quick Match: find an opponent on the same stake and length.
gameRouter.post('/quick', limit('quickMatch'), asyncHandler(async (req, res) => {
  const user = await me(req);
  const r = await arena.quickMatch(user, { stakeKobo: int(req.body?.stakeKobo), durationSec: int(req.body?.durationSec) });
  if (r.status === 'matched') auditLater(req, 'game.quick_matched', { targetType: 'match', targetId: r.matchId });
  res.json(r);
}));
gameRouter.get('/quick', asyncHandler(async (req, res) => {
  const user = await me(req);
  arena.touch(user.id);
  res.json(await arena.queueStatus(user));
}));
gameRouter.delete('/quick', limit('quickMatch'), asyncHandler(async (req, res) => {
  res.json(await arena.leaveQueue(await me(req)));
}));

gameRouter.get('/leaderboard', asyncHandler(async (req, res) => {
  arena.touch(req.userId);
  const period = ['week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const rows = await arena.leaderboard(period);
  res.json({ period, minMatches: arena.LEADERBOARD_MIN, rows, you: rows.find((r) => r.person.id === req.userId) ?? null });
}));

// Learn: what each kind of market teaches, and what your own matches show.
gameRouter.get('/learn', asyncHandler(async (req, res) => {
  arena.touch(req.userId);
  res.json(await learnData(req.userId, await loadGameSettings()));
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
