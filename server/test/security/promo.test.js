// Promotional credits and responsible play: credits are staked first, never
// withdrawn, expire, and turn into restricted winnings that unlock only with
// the trader's own stakes; Kotka's house wallet pays what promotions cost.
// Traders' own limits and breaks hold, and can't be loosened in a hurry.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, stopServer, makeUser, signIn, prisma, runTag } from './helpers.js';
import { clearGameSettingsCache } from '../../src/lib/game/config.js';
import { money, TX } from '../../src/lib/game/matches.js';
import { post, walletFor, HOUSE_WALLET, RESTRICTED_EXPLAINED } from '../../src/lib/game/wallet.js';
import { grantPromo, settleStakes, expirePromoCredits } from '../../src/lib/game/promo.js';
import { assertDepositWithinLimits } from '../../src/lib/game/limits.js';

const naira = (n) => n * 100;
const RULES = { durations: [60], defaultDurationSec: 60, candleSec: 5, historyCandles: 30, speed: 2, countdownSec: 5, lobbyMinutes: 10, drawTolerance: 1, minStakeKobo: 50_000, stakeStepKobo: 10_000 };
let p, q, r, superU, pC, qC, rC, superC;
let savedSettings, houseBefore;
const matches = [];
const campaigns = [];

async function setGame(cfg) {
  await prisma.gameSettings.upsert({ where: { id: 'singleton' }, update: { config: cfg }, create: { id: 'singleton', config: cfg } });
  clearGameSettingsCache();
}
const wallet = (u) => prisma.wallet.findUnique({ where: { userId: u.id } });
async function fund(u, kobo) {
  await prisma.$transaction(async (tx) => {
    const w = await walletFor(u.id, tx);
    await post(tx, { walletId: w.id, userId: u.id, type: 'adjustment', amount: kobo, available: kobo, key: `test-fund:${crypto.randomUUID()}`, reason: 'test funding' });
  }, TX);
}
const days = (n) => new Date(Date.now() + n * 86400e3);

// A challenge posted and accepted (stakes locked), then settled here with a
// chosen result, so the money rules can be checked exactly.
async function duel(creatorC, joinerC, stake = naira(500)) {
  const made = await creatorC.post('/api/game/matches', { mode: 'duel', stakeKobo: stake, open: true });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  const id = made.json.match.id;
  matches.push(id);
  const joined = await joinerC.post(`/api/game/matches/${id}/join`);
  assert.equal(joined.status, 200, JSON.stringify(joined.json));
  return id;
}
async function settleAs(id, { winnerId = null, draw = false }) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.gameMatch.findUnique({ where: { id } });
    const players = await tx.gamePlayer.findMany({ where: { matchId: id } });
    const stake = Number(m.stakeKobo);
    const cash = money(stake, m.feeBps);
    await settleStakes(tx, { match: m, players, stake, fee: cash.fee + (draw ? cash.drawRemainder : 0), winnerId, draw, prize: cash.prize, drawEach: cash.drawEach });
    // Closed here, so the scheduler never settles it again.
    await tx.gameMatch.update({ where: { id }, data: { status: 'SETTLED', settledAt: new Date(), result: { winnerId, draw, test: true } } });
  }, TX);
}

before(async () => {
  await startServer();
  savedSettings = await prisma.gameSettings.findUnique({ where: { id: 'singleton' } });
  await setGame(RULES);
  houseBefore = (await prisma.wallet.upsert({ where: { id: HOUSE_WALLET }, update: {}, create: { id: HOUSE_WALLET, kind: 'house' } })).availableKobo;
  [p, q, r, superU] = await Promise.all([makeUser('PromoPat'), makeUser('PromoQuin'), makeUser('PromoRay'), makeUser('PromoSuper', { role: 'super_admin' })]);
  [pC, qC, rC, superC] = await Promise.all([signIn(p), signIn(q), signIn(r), signIn(superU)]);
});

after(async () => {
  if (savedSettings) await prisma.gameSettings.update({ where: { id: 'singleton' }, data: { config: savedSettings.config } });
  else await prisma.gameSettings.deleteMany({ where: { id: 'singleton' } });
  const ids = [p, q, r, superU].filter(Boolean).map((u) => u.id);
  const own = await prisma.gamePlayer.findMany({ where: { userId: { in: ids } }, select: { matchId: true } });
  const matchIds = [...new Set([...matches, ...own.map((m) => m.matchId)])];
  const wallets = await prisma.wallet.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  await prisma.walletEntry.deleteMany({ where: { OR: [{ walletId: { in: wallets.map((w) => w.id) } }, { userId: { in: ids } }, { matchId: { in: matchIds } }] } });
  await prisma.gameMatch.deleteMany({ where: { OR: [{ id: { in: matchIds } }, { creatorId: { in: ids } }] } });
  await prisma.wallet.deleteMany({ where: { id: { in: wallets.map((w) => w.id) } } });
  await prisma.wallet.update({ where: { id: HOUSE_WALLET }, data: { availableKobo: houseBefore } });
  await prisma.promoCampaign.deleteMany({ where: { id: { in: campaigns } } });
  await prisma.rateLimitHit.deleteMany({ where: { OR: ids.map((id) => ({ key: { contains: id } })) } });
  await stopServer();
});

test('promotional credits are staked first, come back when a challenge closes, and expire on time', async () => {
  await grantPromo({ userId: p.id, amountKobo: naira(600), expiresAt: days(7), reason: `test ${runTag}` });
  await fund(p, naira(300));
  let w = await wallet(p);
  assert.equal(w.promoAvailableKobo, BigInt(naira(600)));
  const home = (await pC.get('/api/game/wallet')).json;
  assert.equal(home.promo.length, 1);
  assert.equal(home.wallet.withdrawableKobo, naira(300), 'credits are never withdrawable');

  const made = await pC.post('/api/game/matches', { mode: 'duel', stakeKobo: naira(500), open: true });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  matches.push(made.json.match.id);
  w = await wallet(p);
  assert.equal(w.promoAvailableKobo, BigInt(naira(100)), 'the stake used credits first');
  assert.equal(w.promoLockedKobo, BigInt(naira(500)));
  assert.equal(w.availableKobo, BigInt(naira(300)), 'own money untouched');
  const player = await prisma.gamePlayer.findFirst({ where: { matchId: made.json.match.id, userId: p.id } });
  assert.equal(player.stakePromoKobo, BigInt(naira(500)));

  assert.equal((await pC.post(`/api/game/matches/${made.json.match.id}/cancel`)).status, 200);
  w = await wallet(p);
  assert.equal(w.promoAvailableKobo, BigInt(naira(600)), 'cancelled: credits back as credits');
  assert.equal(w.promoLockedKobo, 0n);
  const live = await prisma.promoGrant.aggregate({ where: { userId: p.id, revokedAt: null, expiresAt: { gt: new Date() } }, _sum: { remainingKobo: true } });
  assert.equal(live._sum.remainingKobo, w.promoAvailableKobo, 'the wallet matches its live grants');

  await prisma.promoGrant.updateMany({ where: { userId: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expirePromoCredits();
  w = await wallet(p);
  assert.equal(w.promoAvailableKobo, 0n, 'expired credits leave the wallet');
  assert.ok(await prisma.walletEntry.findFirst({ where: { userId: p.id, type: 'promo_expired' } }), 'and the ledger says so');
  assert.equal(w.availableKobo, BigInt(naira(300)));
});

test('winning with credits pays real money, withdrawable only after staking the same of your own; Kotka pays the difference', async () => {
  await grantPromo({ userId: q.id, amountKobo: naira(500), expiresAt: days(7), reason: `test ${runTag}` });
  await fund(r, naira(500));
  const houseStart = (await prisma.wallet.findUnique({ where: { id: HOUSE_WALLET } })).availableKobo;
  const id = await duel(qC, rC);
  await settleAs(id, { winnerId: q.id });
  const { fee, prize } = money(naira(500), (await prisma.gameMatch.findUnique({ where: { id } })).feeBps);
  let w = await wallet(q);
  assert.equal(w.availableKobo, BigInt(prize), 'the prize is real money');
  assert.equal(w.restrictedKobo, BigInt(prize), 'won entirely with credits, so all of it is restricted');
  assert.equal((await qC.get('/api/game/wallet')).json.wallet.withdrawableKobo, 0);
  // Taking money out past what's restricted is refused, with the reason.
  await assert.rejects(prisma.$transaction(async (tx) => post(tx, { walletId: w.id, userId: q.id, type: 'withdrawal_hold', amount: 100, available: -100, pending: 100, key: `test-wd:${crypto.randomUUID()}` }), TX), (err) => err.message === RESTRICTED_EXPLAINED);
  // Kotka's house got the fee and paid the cash the credits turned into.
  const house = (await prisma.wallet.findUnique({ where: { id: HOUSE_WALLET } })).availableKobo;
  assert.equal(house - houseStart, BigInt(fee - naira(500)), 'fee in, the promotional half of the pool out');
  assert.ok(await prisma.walletEntry.findFirst({ where: { matchId: id, type: 'promo_cost' } }));

  // Staking restricted winnings is allowed; staking own money frees them, once a competition runs.
  await fund(q, naira(500));
  await fund(r, naira(500));
  const id2 = await duel(qC, rC);
  const pl = await prisma.gamePlayer.findFirst({ where: { matchId: id2, userId: q.id } });
  assert.equal(pl.stakePromoKobo, 0n);
  assert.equal(pl.stakeRestrictedKobo, 0n, 'own money is used before restricted winnings');
  assert.equal((await wallet(q)).restrictedKobo, BigInt(prize), 'nothing is freed until the match actually runs');
  await settleAs(id2, { winnerId: r.id });
  w = await wallet(q);
  assert.equal(w.restrictedKobo, BigInt(prize - naira(500)), 'staking ₦500 of own money freed ₦500');
  assert.equal(w.availableKobo - w.restrictedKobo, BigInt(naira(500)), 'which can now be withdrawn');
});

test('a draw gives the promotional part back as credits and the rest as money', async () => {
  const pp = await makeUser('PromoDrawA');
  const qq = await makeUser('PromoDrawB');
  const [ppC, qqC] = await Promise.all([signIn(pp), signIn(qq)]);
  await grantPromo({ userId: pp.id, amountKobo: naira(500), expiresAt: days(7), reason: `test ${runTag}` });
  await fund(qq, naira(500));
  const id = await duel(ppC, qqC);
  await settleAs(id, { draw: true });
  const { drawEach } = money(naira(500), (await prisma.gameMatch.findUnique({ where: { id } })).feeBps);
  const a = await wallet(pp);
  const b = await wallet(qq);
  assert.equal(a.promoAvailableKobo, BigInt(drawEach), 'credits in, credits out');
  assert.equal(a.availableKobo, 0n);
  assert.equal(b.availableKobo, BigInt(drawEach));
  // Tidy these two up with the rest.
  const extra = [pp.id, qq.id];
  const ws = await prisma.wallet.findMany({ where: { userId: { in: extra } }, select: { id: true } });
  await prisma.walletEntry.deleteMany({ where: { walletId: { in: ws.map((x) => x.id) } } });
  await prisma.gameMatch.deleteMany({ where: { id } });
  await prisma.wallet.deleteMany({ where: { id: { in: ws.map((x) => x.id) } } });
  await prisma.walletEntry.deleteMany({ where: { matchId: id } });
});

test('credits go only to verified traders, a campaign gives once, and only super admins manage promotions', async () => {
  const unverified = await makeUser('PromoNoKyc');
  await prisma.kycProfile.update({ where: { userId: unverified.id }, data: { status: 'pending' } });
  await assert.rejects(grantPromo({ userId: unverified.id, amountKobo: naira(100), expiresAt: days(1) }), /verified/);
  assert.equal((await pC.get('/api/admin/game/promotions')).status, 403, 'traders can’t see promotions');
  const created = await superC.post('/api/admin/game/promotions/campaigns', { name: `Welcome ${runTag}`, amountKobo: naira(250), expiresInDays: 14, audience: 'manual' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  campaigns.push(created.json.campaign.id);
  const give = () => superC.post('/api/admin/game/promotions/grants', { user: r.username, campaignId: created.json.campaign.id });
  assert.equal((await give()).status, 201);
  assert.equal((await give()).status, 409, 'once per trader per campaign');
  const list = await superC.get('/api/admin/game/promotions');
  const g = list.json.grants.find((x) => x.user.id === r.id);
  assert.ok(g);
  const revoked = await superC.post(`/api/admin/game/promotions/grants/${g.id}/revoke`, { reason: 'test removal' });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.json.removedKobo, naira(250));
  assert.equal((await wallet(r)).promoAvailableKobo, 0n);
});

test('your own limits: lowering works at once, raising waits a day; stake and deposit limits hold', async () => {
  const set = await pC.put('/api/game/limits', { stakeDayKobo: naira(500), depositDayKobo: naira(2000) });
  assert.equal(set.status, 200, JSON.stringify(set.json));
  assert.deepEqual(set.json.applied.sort(), ['depositDayKobo', 'stakeDayKobo']);
  const raise = await pC.put('/api/game/limits', { stakeDayKobo: naira(5000) });
  assert.deepEqual(raise.json.pending, ['stakeDayKobo'], 'a higher limit waits');
  assert.equal(raise.json.limits.stakeDayKobo, naira(500), 'the old limit still applies');
  // Today p already staked ₦500 in the first test, so another stake is over their own limit.
  await fund(p, naira(1000));
  const over = await pC.post('/api/game/matches', { mode: 'duel', stakeKobo: naira(500), open: true });
  assert.equal(over.status, 400);
  assert.equal(over.json.code, 'personal_limit');
  // Deposits: ₦2,000 a day.
  await prisma.deposit.create({ data: { userId: p.id, provider: 'whop', amountKobo: BigInt(naira(1500)), status: 'succeeded' } });
  await assert.rejects(assertDepositWithinLimits(p.id, naira(1000)), (err) => err.code === 'personal_limit' && /₦500/.test(err.message));
  await assertDepositWithinLimits(p.id, naira(500));
  // After the day passes, the higher stake limit applies.
  await prisma.playLimits.update({ where: { userId: p.id }, data: { pendingFrom: new Date(Date.now() - 1000) } });
  assert.equal((await pC.get('/api/game/wallet')).json.limits.stakeDayKobo, naira(5000));
  await prisma.deposit.deleteMany({ where: { userId: p.id } });
});

test('a break stops deposits, stakes and promotions until it ends, and can’t be shortened', async () => {
  const brk = await qC.post('/api/game/limits/break', { kind: '7d' });
  assert.equal(brk.status, 200, JSON.stringify(brk.json));
  const until = new Date(brk.json.until);
  const shorter = await qC.post('/api/game/limits/break', { kind: '24h' });
  assert.equal(new Date(shorter.json.until).getTime(), until.getTime(), 'a shorter break doesn’t end the longer one');
  const stake = await qC.post('/api/game/matches', { mode: 'duel', stakeKobo: naira(500), open: true });
  assert.equal(stake.status, 403);
  assert.equal(stake.json.code, 'on_break');
  assert.equal((await qC.post('/api/game/quick', { stakeKobo: naira(500), durationSec: 60 })).json.code, 'on_break');
  assert.equal((await qC.post('/api/game/ready', { on: true })).json.code, 'on_break');
  await assert.rejects(assertDepositWithinLimits(q.id, naira(1000)), (err) => err.code === 'on_break');
  await assert.rejects(grantPromo({ userId: q.id, amountKobo: naira(100), expiresAt: days(1) }), (err) => err.code === 'on_break');
  const practice = await qC.post('/api/game/matches', { mode: 'practice' });
  assert.equal(practice.status, 201, 'practice stays open');
  matches.push(practice.json.match.id);
});

test('the ledger adds up for promotional credits and restricted winnings too', async () => {
  for (const u of [p, q, r]) {
    const w = await wallet(u);
    const entries = await prisma.walletEntry.findMany({ where: { walletId: w.id }, orderBy: { createdAt: 'asc' } });
    const sum = (k) => entries.reduce((s, e) => s + e[k], 0n);
    assert.equal(sum('availableDelta'), w.availableKobo);
    assert.equal(sum('lockedDelta'), w.lockedKobo);
    assert.equal(sum('promoDelta'), w.promoAvailableKobo);
    assert.equal(sum('promoLockedDelta'), w.promoLockedKobo);
    assert.equal(sum('restrictedDelta'), w.restrictedKobo);
    for (let i = 1; i < entries.length; i++) {
      assert.equal(entries[i].promoBefore, entries[i - 1].promoAfter);
      assert.equal(entries[i].restrictedBefore, entries[i - 1].restrictedAfter);
    }
    assert.ok(w.restrictedKobo <= w.availableKobo, 'restricted is part of available');
  }
});
