// Trading Game: the synthetic market, trading and scoring, the match state
// machine, the wallet ledger and settlement, and real-money flows with Whop
// and Paystack. Payment APIs are answered by a stand-in inside this process
// (nothing leaves the machine). Matches here are 60 seconds at 2× speed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, stopServer, makeUser, signIn, client, prisma, runTag } from './helpers.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { generateMarket, candlesUpTo, candleRange, TEMPLATE_KEYS } from '../../src/lib/game/market.js';
import { PAIR_SYMBOLS } from '../../src/lib/game/pairs.js';
import { simulate, defaultTradingRules } from '../../src/lib/game/trading.js';
import { scorePlayer } from '../../src/lib/game/scoring.js';
import { money, advance, sweep, marketFor } from '../../src/lib/game/matches.js';
import { clearGameSettingsCache } from '../../src/lib/game/config.js';
import { verifyWebhook } from '../../src/lib/game/payments/whop.js';
import { post, walletFor, HOUSE_WALLET } from '../../src/lib/game/wallet.js';

const WHOP_SECRET = `ws_${crypto.randomBytes(32).toString('hex')}`;
const PAYSTACK_KEY = `sk_test_${crypto.randomBytes(20).toString('hex')}`;

// ── Stand-in payment APIs (fetch is intercepted for api.whop.com / api.paystack.co) ──
const realFetch = globalThis.fetch;
const whopPayments = new Map();
const calls = [];
let transferStatus = 'succeeded';
function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.whop.com/api/v1')) {
    const path = u.slice('https://api.whop.com/api/v1'.length);
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ provider: 'whop', method: opts.method, path, body });
    if (path === '/checkout_configurations') return reply(200, { id: `ch_${crypto.randomBytes(6).toString('hex')}`, purchase_url: `/checkout/ch_test/`, metadata: body.metadata });
    if (path.startsWith('/payments/')) {
      const p = whopPayments.get(decodeURIComponent(path.slice('/payments/'.length)));
      return p ? reply(200, p) : reply(404, { error: { message: 'not found' } });
    }
    if (path === '/companies') return reply(200, { id: `biz_${crypto.randomBytes(6).toString('hex')}` });
    if (path === '/account_links') return reply(200, { url: `https://whop.com/verify-identity/${body.account_id}/`, expires_at: new Date(Date.now() + 600e3).toISOString() });
    if (path === '/transfers') return reply(201, { id: `ctt_${crypto.randomBytes(6).toString('hex')}`, status: transferStatus, amount: body.amount, currency: body.currency });
    return reply(404, { error: { message: 'unknown stand-in path' } });
  }
  if (u.startsWith('https://api.paystack.co')) {
    const path = u.slice('https://api.paystack.co'.length);
    calls.push({ provider: 'paystack', method: opts.method, path });
    if (path === '/transaction/initialize') {
      const b = JSON.parse(opts.body);
      return reply(200, { status: true, data: { reference: b.reference, authorization_url: 'https://checkout.paystack.com/test' } });
    }
    if (path.startsWith('/transaction/verify/')) {
      const ref = decodeURIComponent(path.slice('/transaction/verify/'.length));
      const d = await prisma.deposit.findFirst({ where: { providerRef: ref } });
      return reply(200, { status: true, data: { id: 555, status: 'success', currency: 'NGN', amount: Number(d.amountKobo), reference: ref } });
    }
    return reply(404, { status: false, message: 'unknown stand-in path' });
  }
  return realFetch(url, opts);
};

let a, b, c, pending, adminU, superU, aC, bC, cC, pendingC, adminC, superC;
let savedSettings, savedWhop, savedPaystack, base;

const naira = (n) => n * 100;
const balance = (u) => walletFor(u.id); // created on first use, like the app does
async function fund(u, kobo) {
  await prisma.$transaction(async (tx) => {
    const w = await walletFor(u.id, tx);
    await post(tx, { walletId: w.id, userId: u.id, type: 'adjustment', amount: kobo, available: kobo, key: `test-fund:${crypto.randomUUID()}`, reason: 'test funding' });
  });
}
async function setGame(cfg) {
  await prisma.gameSettings.upsert({ where: { id: 'singleton' }, update: { config: cfg }, create: { id: 'singleton', config: cfg } });
  clearGameSettingsCache();
}
const FAST = { durations: [60], defaultDurationSec: 60, candleSec: 5, historyCandles: 30, speed: 2, countdownSec: 5, lobbyMinutes: 10, drawTolerance: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startDuel(creatorC, joinerC, { stakeKobo = naira(500), opponent } = {}) {
  const r = await creatorC.post('/api/game/matches', { mode: 'duel', stakeKobo, ...(opponent ? { opponentId: opponent.id } : { open: true }) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const id = r.json.match.id;
  assert.equal((await joinerC.post(`/api/game/matches/${id}/join`)).status, 200);
  await creatorC.post(`/api/game/matches/${id}/confirm`);
  await joinerC.post(`/api/game/matches/${id}/confirm`);
  return id;
}
async function untilActive(id) {
  for (let i = 0; i < 40; i++) {
    const m = await advance(id);
    if (m.status === 'ACTIVE') return m;
    await sleep(250);
  }
  throw new Error('match never became active');
}
async function untilSettled(id) {
  for (let i = 0; i < 160; i++) {
    const m = await advance(id);
    if (['SETTLED', 'DISPUTED', 'REFUNDED'].includes(m.status)) return m;
    await sleep(300);
  }
  throw new Error('match never settled');
}
const thesis = { view: 'bullish', reasons: ['trend'], confidence: 'medium' };

before(async () => {
  base = await startServer();
  savedSettings = await prisma.gameSettings.findUnique({ where: { id: 'singleton' } });
  savedWhop = await prisma.integration.findUnique({ where: { provider: 'whop' } });
  savedPaystack = await prisma.integration.findUnique({ where: { provider: 'paystack' } });
  await setGame(FAST);
  await prisma.integration.upsert({ where: { provider: 'whop' }, update: { secretCipher: encryptSecret('whop-test-key'), enabled: true, config: { companyId: 'biz_kotkatest', webhookSecretCipher: encryptSecret(WHOP_SECRET) } }, create: { provider: 'whop', secretCipher: encryptSecret('whop-test-key'), enabled: true, config: { companyId: 'biz_kotkatest', webhookSecretCipher: encryptSecret(WHOP_SECRET) } } });
  await prisma.integration.upsert({ where: { provider: 'paystack' }, update: { secretCipher: encryptSecret(PAYSTACK_KEY), enabled: true }, create: { provider: 'paystack', secretCipher: encryptSecret(PAYSTACK_KEY), enabled: true } });
  [a, b, c, adminU, superU] = await Promise.all([makeUser('GameAda'), makeUser('GameBayo'), makeUser('GameChi'), makeUser('GameAdmin', { role: 'admin' }), makeUser('GameSuper', { role: 'super_admin' })]);
  pending = await makeUser('GamePending');
  await prisma.kycProfile.update({ where: { userId: pending.id }, data: { status: 'pending' } });
  [aC, bC, cC, pendingC, adminC, superC] = await Promise.all([signIn(a), signIn(b), signIn(c), signIn(pending), signIn(adminU), signIn(superU)]);
});

after(async () => {
  if (savedSettings) await prisma.gameSettings.update({ where: { id: 'singleton' }, data: { config: savedSettings.config } });
  else await prisma.gameSettings.deleteMany({ where: { id: 'singleton' } });
  for (const [name, saved] of [['whop', savedWhop], ['paystack', savedPaystack]]) {
    if (saved) await prisma.integration.update({ where: { provider: name }, data: { secretCipher: saved.secretCipher, enabled: saved.enabled, config: saved.config } });
    else await prisma.integration.deleteMany({ where: { provider: name } });
  }
  // Game rows reference users without cascading money records; clear them first.
  const ids = [a, b, c, pending, adminU, superU].filter(Boolean).map((u) => u.id);
  const matches = await prisma.gamePlayer.findMany({ where: { userId: { in: ids } }, select: { matchId: true } });
  await prisma.gameMatch.deleteMany({ where: { OR: [{ id: { in: matches.map((m) => m.matchId) } }, { creatorId: { in: ids } }] } });
  const wallets = await prisma.wallet.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  await prisma.walletEntry.deleteMany({ where: { OR: [{ walletId: { in: wallets.map((w) => w.id) } }, { userId: { in: ids } }] } });
  await prisma.wallet.deleteMany({ where: { id: { in: wallets.map((w) => w.id) } } });
  await prisma.deposit.deleteMany({ where: { userId: { in: ids } } });
  await prisma.withdrawal.deleteMany({ where: { userId: { in: ids } } });
  await prisma.paymentWebhookEvent.deleteMany({ where: { id: { contains: runTag } } });
  await prisma.rateLimitHit.deleteMany({ where: { OR: ids.map((id) => ({ key: { contains: id } })) } });
  globalThis.fetch = realFetch;
  await stopServer();
});

// ── The engine (no database) ────────────────────────────────────────────────

const mk = (o) => generateMarket({ durationSec: 900, candleSec: 15, historyCandles: 80, symbol: 'KTK/NGN', backgroundTicks: 3600, ...o });

test('the synthetic market is deterministic, and the same scenario, pair and seed replay exactly', () => {
  for (const scenario of TEMPLATE_KEYS) {
    const x = mk({ scenario, seed: 424242 });
    const y = mk({ scenario, seed: 424242 });
    const z = mk({ scenario, seed: 424243 });
    assert.equal(x.hash, y.hash, scenario);
    assert.notEqual(x.hash, z.hash, `${scenario}: a different seed gives a different path`);
    assert.notEqual(mk({ scenario, seed: 424242, symbol: 'KGD/USD' }).hash, x.hash, 'a different pair, a different path');
    assert.equal(x.prices.length, 3600 + 80 * 15 + 900);
    assert.ok(x.prices.every((p) => p > 0 && Number.isFinite(p)));
    const candles = candlesUpTo(x, x.prices.length - 1);
    assert.equal(candles.length, (3600 + 1200) / 15 + 60);
    assert.ok(candles.every((k) => k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c)));
  }
  // Older matches (version 1) still regenerate exactly as they were made.
  const old = generateMarket({ scenario: 'bull_trend', seed: 2024, durationSec: 900, candleSec: 15, historyCandles: 80, version: 1 });
  assert.equal(old.prices.length, 2100);
  assert.equal(old.decimals, 2);
});

test('every Kotka pair generates at its own precision, and timeframes agree with each other', () => {
  for (const symbol of PAIR_SYMBOLS) {
    const m = mk({ scenario: 'range', seed: 9, symbol });
    const dp = m.decimals;
    assert.ok(m.prices.every((p) => Math.abs(p * 10 ** dp - Math.round(p * 10 ** dp)) < 1e-6), `${symbol} rounds to ${dp} dp`);
  }
  const m = mk({ scenario: 'breakout', seed: 31 });
  const upToAbs = m.historyTicks + 299;
  // Each 1-minute candle is exactly its sixty 1-second candles.
  const one = candleRange(m, 1, { limit: 1000, upToAbs }).candles.filter((c) => c.t >= 0 && c.t < 300);
  const min = candleRange(m, 60, { limit: 1000, upToAbs }).candles.filter((c) => c.t >= 0 && c.t < 300);
  assert.equal(min.length, 5);
  for (const c of min) {
    const parts = one.filter((x) => x.t >= c.t && x.t < c.t + 60);
    assert.equal(parts.length, 60);
    assert.equal(c.c, parts.at(-1).c);
    assert.equal(c.h, Math.max(...parts.map((x) => x.h)));
    assert.equal(c.l, Math.min(...parts.map((x) => x.l)));
    assert.equal(c.v, parts.reduce((s, x) => s + x.v, 0));
  }
  // Nothing past the visible tick, at any timeframe, and history pages join up.
  for (const tf of [1, 5, 15, 30, 60, 180, 300, 900, 1800, 3600]) {
    const r = candleRange(m, tf, { limit: 1000, upToAbs: m.historyTicks + 120 });
    assert.ok(r.candles.every((c) => c.t <= 120), `tf ${tf}`);
  }
  const page1 = candleRange(m, 60, { limit: 10, upToAbs: m.historyTicks - 1 });
  const page2 = candleRange(m, 60, { beforeT: page1.candles[0].t, limit: 10, upToAbs: m.historyTicks - 1 });
  assert.equal(page2.candles.at(-1).t + 60, page1.candles[0].t, 'older page ends where the newer begins');
  assert.equal(page2.more, true);
});

test('same trade, different process, different score', () => {
  const market = mk({ scenario: 'bull_trend', seed: 2024 });
  const rules = defaultTradingRules();
  const p = market.prices[market.historyTicks + 120];
  const disciplined = [{ seq: 1, tick: 120, type: 'open', payload: { side: 'long', sizePct: 200, stop: +(p * 0.99).toFixed(2), target: +(p * 1.03).toFixed(2), thesis } }, { seq: 2, tick: 700, type: 'close', payload: {} }];
  const careless = [{ seq: 1, tick: 120, type: 'open', payload: { side: 'long', sizePct: 200, thesis } }, { seq: 2, tick: 700, type: 'close', payload: {} }];
  const sa = simulate({ market, actions: disciplined, capital: 100000, rules, final: true });
  const sb = simulate({ market, actions: careless, capital: 100000, rules, final: true });
  assert.equal(sa.returnPct, sb.returnPct, 'identical outcome');
  const A = scorePlayer({ market, sim: sa, rules });
  const B = scorePlayer({ market, sim: sb, rules });
  assert.ok(A.score > B.score + 5, `${A.score} vs ${B.score}`);
  assert.ok(B.findings.some((f) => f.key === 'no_stop'));
});

test('stops fill from the market path, and the end of the match closes what is open', () => {
  const market = mk({ scenario: 'bear_trend', seed: 99 });
  const p = market.prices[market.historyTicks + 10];
  const sim = simulate({ market, actions: [{ seq: 1, tick: 10, type: 'open', payload: { side: 'long', sizePct: 100, stop: +(p * 0.997).toFixed(2), thesis } }], capital: 100000, rules: defaultTradingRules(), final: true });
  assert.equal(sim.trades.length, 1);
  assert.ok(['stop', 'end'].includes(sim.trades[0].exitReason));
  assert.equal(sim.position, null);
  const held = simulate({ market, actions: [{ seq: 1, tick: 10, type: 'open', payload: { side: 'short', sizePct: 100, thesis: { ...thesis, view: 'bearish' } } }], capital: 100000, rules: defaultTradingRules(), final: true });
  assert.equal(held.trades[0].exitReason, 'end');
});

test('fee, prize and draw maths', () => {
  assert.deepEqual(money(naira(500), 1000), { pool: naira(1000), fee: naira(100), prize: naira(900), drawEach: naira(450), drawRemainder: 0 });
  assert.equal(money(naira(1500), 750).fee, 22500);
  const odd = money(1, 0);
  assert.equal(odd.drawEach * 2 + odd.drawRemainder, odd.prize, 'no kobo lost in a split');
});

test('Whop webhook signatures: valid, forged, stale', () => {
  const body = Buffer.from('{"type":"payment.succeeded"}');
  const ts = Math.floor(Date.now() / 1000);
  const sign = (secret, id, t, raw) => `v1,${crypto.createHmac('sha256', Buffer.from(secret)).update(`${id}.${t}.${raw}`).digest('base64')}`;
  assert.equal(verifyWebhook(body, { 'webhook-id': 'msg_1', 'webhook-timestamp': String(ts), 'webhook-signature': sign(WHOP_SECRET, 'msg_1', ts, body) }, WHOP_SECRET).ok, true);
  assert.equal(verifyWebhook(body, { 'webhook-id': 'msg_1', 'webhook-timestamp': String(ts), 'webhook-signature': sign('ws_wrong', 'msg_1', ts, body) }, WHOP_SECRET).ok, false);
  assert.equal(verifyWebhook(Buffer.from('{"type":"payment.succeeded","x":1}'), { 'webhook-id': 'msg_1', 'webhook-timestamp': String(ts), 'webhook-signature': sign(WHOP_SECRET, 'msg_1', ts, body) }, WHOP_SECRET).ok, false, 'a changed body');
  assert.equal(verifyWebhook(body, { 'webhook-id': 'msg_1', 'webhook-timestamp': String(ts - 600), 'webhook-signature': sign(WHOP_SECRET, 'msg_1', ts - 600, body) }, WHOP_SECRET).ok, false, 'too old');
});

// ── Matches and money ───────────────────────────────────────────────────────

test('a ₦500 duel: stakes lock, both trade the same market, it settles once with the fee', async () => {
  await fund(a, naira(1000));
  await fund(b, naira(1000));
  const id = await startDuel(aC, bC);
  assert.equal(Number((await balance(a)).lockedKobo), naira(500));
  assert.equal(Number((await balance(b)).availableKobo), naira(500));
  await untilActive(id);

  // Same market for both: identical candles.
  const va = await aC.get(`/api/game/matches/${id}/state`);
  const ca = await aC.get(`/api/game/matches/${id}/candles?tf=15&before=0`);
  const cb = await bC.get(`/api/game/matches/${id}/candles?tf=15&before=0`);
  assert.deepEqual(ca.json.candles.map((x) => [x.t, x.o, x.h, x.l, x.c, x.v]), cb.json.candles.map((x) => [x.t, x.o, x.h, x.l, x.c, x.v]), 'identical market for both');
  // The future isn't sent: no candle beyond the current tick.
  const m = await prisma.gameMatch.findUnique({ where: { id } });
  const market = marketFor(m);
  const latest = await aC.get(`/api/game/matches/${id}/candles?tf=1`);
  const after = await aC.get(`/api/game/matches/${id}/state`);
  assert.ok(latest.json.candles.at(-1).t <= latest.json.lastT, 'no candle beyond the visible second');
  assert.ok(latest.json.lastT <= after.json.tick, 'and that second had already happened');
  assert.equal(va.json.price, market.prices[market.historyTicks + va.json.tick]);

  // A trades with a plan; B trades without one.
  // The chart: candles at any timeframe, never beyond the tick; the live tick feed; the pair.
  assert.ok(va.json.chart?.symbol, 'the match has a Kotka pair');
  for (const tf of [1, 60]) {
    const c = await aC.get(`/api/game/matches/${id}/candles?tf=${tf}`);
    assert.equal(c.status, 200);
    assert.ok(c.json.candles.length > 0);
    assert.ok(c.json.candles.every((x) => x.t <= c.json.lastT), `tf ${tf}: no future candles`);
  }
  assert.equal((await aC.get(`/api/game/matches/${id}/candles?tf=7`)).status, 400, 'only the offered timeframes');
  assert.equal((await cC.get(`/api/game/matches/${id}/candles?tf=60`)).status, 404, 'only players see the chart');
  const feed = await aC.get(`/api/game/matches/${id}/state?ticksSince=${va.json.tick - 3}`);
  assert.ok(Array.isArray(feed.json.ticks) && feed.json.ticks.every(([t]) => t > va.json.tick - 3 && t <= feed.json.tick));
  // Drawings are saved per trader and nobody else's to read or write.
  const layout = { drawings: [{ name: 'segment', points: [{ t: -120, value: 1 }, { t: 0, value: 2 }] }], timeframe: 60 };
  assert.equal((await aC.put(`/api/game/charts/match:${id}`, { layout })).status, 200);
  assert.deepEqual((await aC.get(`/api/game/charts/match:${id}`)).json.layout, layout);
  assert.equal((await bC.get(`/api/game/charts/match:${id}`)).json.layout, null, 'B sees their own (empty) chart, not A’s');
  assert.equal((await cC.put(`/api/game/charts/match:${id}`, { layout })).status, 404, 'not in the match');
  assert.equal((await aC.put(`/api/game/charts/match:${id}`, { layout: { drawings: Array.from({ length: 301 }, () => ({})) } })).status, 413);

  const price = va.json.price;
  const opened = await aC.post(`/api/game/matches/${id}/actions`, { type: 'open', payload: { side: 'long', sizePct: 100, stop: +(price * 0.99).toFixed(2), target: +(price * 1.02).toFixed(2), thesis }, ticksSince: va.json.chart.lastT - 1 }, { 'Idempotency-Key': 'open-ada-00001' });
  assert.equal(opened.status, 200, JSON.stringify(opened.json));
  assert.ok(opened.json.me.position);
  assert.ok(Array.isArray(opened.json.ticks) && opened.json.ticks.length >= 1 && opened.json.candles === undefined, 'the new chart gets one-second prices back, not candles');
  assert.equal((await aC.post(`/api/game/matches/${id}/cancel`)).status, 409, 'a staked match can’t be ended early');
  const again = await aC.post(`/api/game/matches/${id}/actions`, { type: 'open', payload: { side: 'long', sizePct: 100, stop: +(price * 0.99).toFixed(2), thesis } }, { 'Idempotency-Key': 'open-ada-00001' });
  assert.equal(again.status, 200, 'a replayed request is recognised');
  assert.equal(await prisma.gameAction.count({ where: { matchId: id, userId: a.id } }), 1, 'and not stored twice');
  assert.equal((await bC.post(`/api/game/matches/${id}/actions`, { type: 'open', payload: { side: 'short', sizePct: 400, thesis: { view: 'bearish', reasons: ['momentum'], confidence: 'high' } } })).status, 200);

  const done = await untilSettled(id);
  assert.equal(done.status, 'SETTLED');
  const players = await prisma.gamePlayer.findMany({ where: { matchId: id } });
  assert.equal(players.length, 2);
  assert.ok(players.every((p) => typeof p.score === 'number' && p.report?.learning?.summary));
  const transitions = (await prisma.gameMatchTransition.findMany({ where: { matchId: id }, orderBy: { createdAt: 'asc' } })).map((t) => t.toState);
  assert.deepEqual(transitions, ['CREATED', 'WAITING_FOR_OPPONENT', 'READY', 'LOCKED', 'COUNTDOWN', 'ACTIVE', 'COMPLETED', 'SCORING', 'SETTLEMENT', 'SETTLED']);

  const entries = await prisma.walletEntry.findMany({ where: { matchId: id } });
  const fee = entries.find((e) => e.type === 'fee');
  const result = done.result;
  if (result.draw) {
    assert.equal(entries.filter((e) => e.type === 'draw_return').length, 2);
    assert.equal(Number(fee.amountKobo), naira(100));
  } else if (result.refund) {
    assert.fail('both traded, so it is not a refund');
  } else {
    assert.equal(Number(fee.amountKobo), naira(100));
    const win = entries.filter((e) => e.type === 'winnings');
    assert.equal(win.length, 1);
    assert.equal(Number(win[0].amountKobo), naira(900));
    const winner = win[0].userId === a.id ? a : b;
    const loser = winner === a ? b : a;
    assert.equal(Number((await balance(winner)).availableKobo), naira(500) + naira(900));
    assert.equal(Number((await balance(loser)).availableKobo), naira(500));
  }
  assert.equal(Number((await balance(a)).lockedKobo), 0);
  assert.equal(Number((await balance(b)).lockedKobo), 0);

  // Settling again changes nothing.
  await Promise.all([advance(id), advance(id), sweep()]);
  assert.equal(await prisma.walletEntry.count({ where: { matchId: id } }), entries.length);

  // The result page shows both players and the whole market.
  const report = await aC.get(`/api/game/matches/${id}/state`);
  assert.equal(report.json.report.players.length, 2);
  assert.ok(report.json.match.scenario?.code?.startsWith('KTK-'));
  const hist = await aC.get('/api/game/history');
  assert.ok(hist.json.matches.some((x) => x.id === id));
  const prof = await aC.get('/api/game/profile');
  assert.ok(prof.json.profile.xp > 0);
});

test('parallel entries cannot spend the same money twice', async () => {
  await fund(c, naira(500));
  const tries = await Promise.all(Array.from({ length: 4 }, () => cC.post('/api/game/matches', { mode: 'duel', stakeKobo: naira(500), open: true })));
  assert.equal(tries.filter((r) => r.status === 201).length, 1, tries.map((r) => r.status).join(','));
  const w = await balance(c);
  assert.equal(Number(w.availableKobo), 0);
  assert.equal(Number(w.lockedKobo), naira(500));
  const open = await prisma.gameMatch.findFirst({ where: { creatorId: c.id, status: 'WAITING_FOR_OPPONENT' } });

  // Two people accept the same open challenge at once: one gets it.
  await fund(a, naira(500));
  await fund(b, naira(500));
  const joins = await Promise.all([aC.post(`/api/game/matches/${open.id}/join`), bC.post(`/api/game/matches/${open.id}/join`)]);
  assert.equal(joins.filter((r) => r.status === 200).length, 1);
  assert.equal(await prisma.gamePlayer.count({ where: { matchId: open.id } }), 2);
  // Leaving the lobby returns both stakes.
  assert.equal((await cC.post(`/api/game/matches/${open.id}/cancel`)).status, 200);
  assert.equal(Number((await balance(c)).availableKobo), naira(500));
  assert.equal(Number((await balance(c)).lockedKobo), 0);
});

test('challenges expire and stakes come back; you cannot join your own or a private one', async () => {
  await fund(c, naira(500));
  const startBal = Number((await balance(c)).availableKobo);
  const r = await cC.post('/api/game/matches', { mode: 'duel', stakeKobo: naira(500), opponentId: a.id });
  assert.equal(r.status, 201);
  const id = r.json.match.id;
  assert.equal((await cC.post(`/api/game/matches/${id}/join`)).status, 400, 'not your own');
  assert.equal((await bC.post(`/api/game/matches/${id}/join`)).status, 403, 'it is for someone else');
  assert.equal((await bC.get(`/api/game/matches/${id}/state`)).status, 404, 'and hidden from others');
  await prisma.gameMatch.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const m = await advance(id);
  assert.equal(m.status, 'EXPIRED');
  assert.equal(Number((await balance(c)).lockedKobo), 0);
  assert.equal(Number((await balance(c)).availableKobo), startBal);
});

test('neither player trades: stakes back in full, no fee; a draw splits the prize', async () => {
  await fund(a, naira(500));
  await fund(b, naira(500));
  const before = { a: Number((await balance(a)).availableKobo), b: Number((await balance(b)).availableKobo) };
  const id = await startDuel(aC, bC);
  const m = await untilSettled(id);
  assert.equal(m.result.refund, true);
  assert.equal(await prisma.walletEntry.count({ where: { matchId: id, type: 'fee' } }), 0);
  assert.equal(Number((await balance(a)).availableKobo), before.a);
  assert.equal(Number((await balance(b)).availableKobo), before.b);

  // With a wide draw tolerance, two traders who both trade draw.
  await setGame({ ...FAST, drawTolerance: 100 });
  const id2 = await startDuel(aC, bC);
  const active = await untilActive(id2);
  const view = await aC.get(`/api/game/matches/${active.id}/state`);
  await aC.post(`/api/game/matches/${id2}/actions`, { type: 'open', payload: { side: 'long', sizePct: 50, thesis } });
  await bC.post(`/api/game/matches/${id2}/actions`, { type: 'open', payload: { side: 'long', sizePct: 50, thesis } });
  assert.ok(view.json.price);
  const d = await untilSettled(id2);
  assert.equal(d.result.draw, true);
  const draws = await prisma.walletEntry.findMany({ where: { matchId: id2, type: 'draw_return' } });
  assert.deepEqual(draws.map((e) => Number(e.amountKobo)), [naira(450), naira(450)]);
  await setGame(FAST);
});

test('the server decides: no trading before the start, bad orders refused, future timing flagged', async () => {
  await fund(a, naira(500));
  await fund(b, naira(500));
  const id = await startDuel(aC, bC);
  assert.equal((await aC.post(`/api/game/matches/${id}/actions`, { type: 'open', payload: { side: 'long', sizePct: 50, thesis } })).status, 409, 'not before the start');
  const m = await untilActive(id);
  const price = (await aC.get(`/api/game/matches/${id}/state`)).json.price;
  const bad = [
    { type: 'open', payload: { side: 'long', sizePct: 50 } }, // no thesis
    { type: 'open', payload: { side: 'long', sizePct: 5000, thesis } }, // over the leverage cap
    { type: 'open', payload: { side: 'long', sizePct: 50, stop: price * 1.1, thesis } }, // stop on the wrong side
    { type: 'open', payload: { side: 'sideways', sizePct: 50, thesis } },
    { type: 'close', payload: {} }, // nothing to close
    { type: 'teleport', payload: {} },
    { type: 'open', payload: { side: 'long', sizePct: -50, thesis } },
  ];
  for (const x of bad) assert.equal((await aC.post(`/api/game/matches/${id}/actions`, x)).status, 400, JSON.stringify(x));
  const future = await aC.post(`/api/game/matches/${id}/actions`, { type: 'open', payload: { side: 'long', sizePct: 50, thesis }, clientTick: 10_000 });
  assert.equal(future.status, 409);
  assert.ok((await prisma.gameMatch.findUnique({ where: { id } })).flags.some((f) => f.kind === 'impossible_timing'));
  // Someone else can't act in, or look into, this match.
  assert.equal((await cC.post(`/api/game/matches/${id}/actions`, { type: 'close', payload: {} })).status, 403);
  assert.equal((await cC.get(`/api/game/matches/${id}/state`)).status, 404);
  assert.equal(m.status, 'ACTIVE');
  await untilSettled(id);
});

test('stakes need a verified identity; practice does not', async () => {
  await fund(pending, naira(1000));
  const r = await pendingC.post('/api/game/matches', { mode: 'duel', stakeKobo: naira(500), open: true });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'kyc_required_for_money');
  assert.equal((await pendingC.post('/api/game/wallet/deposits', { amountKobo: naira(1000) })).status, 403);
  const p = await pendingC.post('/api/game/matches', { mode: 'practice' });
  assert.equal(p.status, 201);
  const m = await untilSettled(p.json.match.id);
  assert.equal(m.status, 'SETTLED');
  assert.equal(await prisma.walletEntry.count({ where: { matchId: m.id } }), 0, 'practice never touches money');
  // Choosing a pair; only offered pairs.
  const chosen = await pendingC.post('/api/game/matches', { mode: 'practice', symbol: 'KGD/USD' });
  assert.equal(chosen.status, 201);
  assert.equal((await prisma.gameMatch.findUnique({ where: { id: chosen.json.match.id } })).symbol, 'KGD/USD');
  assert.equal((await aC.post('/api/game/matches', { mode: 'practice', symbol: 'EUR/USD' })).status, 400, 'real-world symbols are not Kotka pairs');
  // One match at a time, but a practice can be ended early (to switch pair).
  assert.equal((await pendingC.post('/api/game/matches', { mode: 'practice' })).json?.code, 'in_match');
  assert.equal((await pendingC.post(`/api/game/matches/${chosen.json.match.id}/cancel`)).status, 200);
  assert.equal((await prisma.gameMatch.findUnique({ where: { id: chosen.json.match.id } })).status, 'ABANDONED');
  const next = await pendingC.post('/api/game/matches', { mode: 'practice', symbol: 'KEU/USD' });
  assert.equal(next.status, 201);
  await prisma.gameMatch.deleteMany({ where: { id: { in: [chosen.json.match.id, next.json.match.id] } } });
  // Stake rules.
  for (const stake of [naira(499), naira(750), naira(1_000_000), -500, 'abc']) assert.equal((await aC.post('/api/game/matches', { mode: 'duel', stakeKobo: stake, open: true })).status, 400, String(stake));
});

// ── Deposits and withdrawals ────────────────────────────────────────────────

function whopDelivery(event, id = `msg_${runTag}_${crypto.randomBytes(4).toString('hex')}`) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', Buffer.from(WHOP_SECRET)).update(`${id}.${ts}.${raw}`).digest('base64');
  return fetch(`${base}/api/game/webhooks/whop`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` }, body: raw });
}

test('Whop deposit: credited once, only after a verified webhook that matches the payment', async () => {
  const start = await cC.post('/api/game/wallet/deposits', { amountKobo: naira(2000) });
  assert.equal(start.status, 201, JSON.stringify(start.json));
  assert.match(start.json.checkoutUrl, /^https:\/\/whop\.com\/checkout\//);
  const dep = start.json.deposit;
  const beforeBal = Number((await balance(c)).availableKobo);
  assert.equal((await cC.post('/api/game/wallet/deposits', { amountKobo: naira(999) })).status, 400, 'under the ₦1,000 minimum');

  // A forged webhook does nothing.
  const forged = await fetch(`${base}/api/game/webhooks/whop`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': 'msg_x', 'webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'webhook-signature': 'v1,AAAA' }, body: '{}' });
  assert.equal(forged.status, 401);

  // A payment for the wrong amount is not credited.
  whopPayments.set('pay_wrong', { id: 'pay_wrong', status: 'paid', substatus: 'succeeded', subtotal: 20, total: 20, currency: 'ngn', metadata: { kotka_deposit: dep.id } });
  const wrong = await whopDelivery({ type: 'payment.succeeded', data: { id: 'pay_wrong', metadata: { kotka_deposit: dep.id } } });
  assert.equal(wrong.status, 500);
  assert.equal(Number((await balance(c)).availableKobo), beforeBal);

  whopPayments.set('pay_ok', { id: 'pay_ok', status: 'paid', substatus: 'succeeded', subtotal: 2000, total: 2000, currency: 'ngn', metadata: { kotka_deposit: dep.id } });
  const id = `msg_${runTag}_ok`;
  assert.equal((await whopDelivery({ type: 'payment.succeeded', data: { id: 'pay_ok', metadata: { kotka_deposit: dep.id } } }, id)).status, 200);
  assert.equal((await whopDelivery({ type: 'payment.succeeded', data: { id: 'pay_ok', metadata: { kotka_deposit: dep.id } } }, id)).status, 200, 'redelivery');
  assert.equal((await whopDelivery({ type: 'payment.succeeded', data: { id: 'pay_ok', metadata: { kotka_deposit: dep.id } } })).status, 200, 'a second event for the same payment');
  assert.equal(Number((await balance(c)).availableKobo), beforeBal + naira(2000), 'credited exactly once');
  assert.equal((await prisma.deposit.findUnique({ where: { id: dep.id } })).status, 'succeeded');
  assert.equal(await prisma.walletEntry.count({ where: { depositId: dep.id } }), 1);
});

test('Paystack deposit (switchable): signed webhook credits once', async () => {
  await setGame({ ...FAST, paystackEnabled: true });
  const start = await cC.post('/api/game/wallet/deposits', { amountKobo: naira(1500), provider: 'paystack' });
  assert.equal(start.status, 201, JSON.stringify(start.json));
  const dep = start.json.deposit;
  const before = Number((await balance(c)).availableKobo);
  // A unique transaction id per run: redeliveries of one id are (rightly) ignored.
  const raw = JSON.stringify({ event: 'charge.success', data: { id: `${runTag}${crypto.randomBytes(3).toString('hex')}`, reference: dep.id } });
  const sig = crypto.createHmac('sha512', PAYSTACK_KEY).update(raw).digest('hex');
  const send = (s) => fetch(`${base}/api/game/webhooks/paystack`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': s }, body: raw });
  assert.equal((await send('bad')).status, 401);
  assert.equal((await send(sig)).status, 200);
  assert.equal((await send(sig)).status, 200);
  assert.equal(Number((await balance(c)).availableKobo), before + naira(1500));
  await setGame(FAST);
});

test('withdrawals: held, approved by an admin, paid; rejected or failed ones come back', async () => {
  // Payout account on Whop first.
  const link = await cC.post('/api/game/wallet/payout/whop', {});
  assert.equal(link.status, 200);
  assert.match(link.json.url, /^https:\/\/whop\.com\//);
  const start = Number((await balance(c)).availableKobo);
  assert.equal((await cC.post('/api/game/wallet/withdrawals', { amountKobo: start + 100 })).status, 400, 'more than the balance');

  const both = await Promise.all([cC.post('/api/game/wallet/withdrawals', { amountKobo: start }), cC.post('/api/game/wallet/withdrawals', { amountKobo: start })]);
  assert.equal(both.filter((r) => r.status === 201).length, 1, 'the same money can’t be withdrawn twice');
  const w = both.find((r) => r.status === 201).json.withdrawal;
  assert.equal(w.status, 'requested');
  assert.equal(Number((await balance(c)).pendingWithdrawKobo), start);

  assert.equal((await aC.post(`/api/admin/game/withdrawals/${w.id}/approve`)).status, 403, 'traders can’t approve');
  const ok = await adminC.post(`/api/admin/game/withdrawals/${w.id}/approve`);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.withdrawal.status, 'paid');
  const bal = await balance(c);
  assert.equal(Number(bal.pendingWithdrawKobo), 0);
  assert.equal(Number(bal.availableKobo), 0);
  assert.equal((await adminC.post(`/api/admin/game/withdrawals/${w.id}/approve`)).status, 409, 'once only');
  const transfer = calls.filter((x) => x.provider === 'whop' && x.path === '/transfers').at(-1);
  assert.equal(transfer.body.idempotence_key, w.id);
  assert.equal(transfer.body.amount, start / 100);

  // Rejected: money back.
  await fund(c, naira(1000));
  const r2 = (await cC.post('/api/game/wallet/withdrawals', { amountKobo: naira(1000) })).json.withdrawal;
  assert.equal((await adminC.post(`/api/admin/game/withdrawals/${r2.id}/reject`, { note: 'Please verify your payout account' })).status, 200);
  assert.equal(Number((await balance(c)).availableKobo), naira(1000));
  // Failed at the provider: money back.
  transferStatus = 'failed';
  const r3 = (await cC.post('/api/game/wallet/withdrawals', { amountKobo: naira(1000) })).json.withdrawal;
  await adminC.post(`/api/admin/game/withdrawals/${r3.id}/approve`);
  transferStatus = 'succeeded';
  assert.equal((await prisma.withdrawal.findUnique({ where: { id: r3.id } })).status, 'failed');
  assert.equal(Number((await balance(c)).availableKobo), naira(1000));
  // Cancelled by the person while waiting.
  const r4 = (await cC.post('/api/game/wallet/withdrawals', { amountKobo: naira(1000) })).json.withdrawal;
  assert.equal((await cC.post(`/api/game/wallet/withdrawals/${r4.id}/cancel`)).status, 200);
  assert.equal(Number((await balance(c)).availableKobo), naira(1000));
});

// ── Admin, accounts, the ledger ─────────────────────────────────────────────

test('admin rights: traders see nothing, admins review, super admins change money rules', async () => {
  assert.equal((await aC.get('/api/admin/game/overview')).status, 403);
  assert.equal((await client().get('/api/admin/game/overview')).status, 401);
  assert.equal((await adminC.get('/api/admin/game/overview')).status, 200);
  assert.equal((await adminC.put('/api/admin/game/settings', { feeBps: 0 })).status, 403);
  assert.equal((await adminC.post('/api/admin/game/adjustments', { userId: a.id, amountKobo: 100000, reason: 'bonus please' })).status, 403);
  assert.equal((await superC.put('/api/admin/game/settings', { feeBps: 99999 })).status, 400);
  const ok = await superC.put('/api/admin/game/settings', { ...FAST, feeBps: 800 });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.settings.feeBps, 800);
  assert.ok(await prisma.auditLog.findFirst({ where: { actorId: superU.id, action: 'game.settings_updated' } }));
  await setGame(FAST);
});

test('an account with money in the wallet can’t be deleted', async () => {
  const bal = await balance(c);
  assert.ok(bal.availableKobo > 0n);
  const r = await cC.delete('/api/account', { password: 'Correct-Horse-Battery-9' });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /wallet/i);
});

test('the ledger adds up: every wallet equals the sum of its entries, and before/after chain', async () => {
  const ids = [a, b, c, pending].map((u) => u.id);
  const wallets = await prisma.wallet.findMany({ where: { OR: [{ userId: { in: ids } }, { id: HOUSE_WALLET }] } });
  for (const w of wallets) {
    const entries = await prisma.walletEntry.findMany({ where: { walletId: w.id }, orderBy: { createdAt: 'asc' } });
    if (w.id === HOUSE_WALLET) continue; // shared with other runs
    const sum = (k) => entries.reduce((s, e) => s + e[k], 0n);
    assert.equal(sum('availableDelta'), w.availableKobo, `available for ${w.id}`);
    assert.equal(sum('lockedDelta'), w.lockedKobo, `locked for ${w.id}`);
    assert.equal(sum('pendingDelta'), w.pendingWithdrawKobo, `pending for ${w.id}`);
    for (let i = 1; i < entries.length; i++) assert.equal(entries[i].availableBefore, entries[i - 1].availableAfter, 'each entry starts where the last ended');
  }
});
