// Usage Control: limits per day / week / month, most restrictive wins,
// resets, overrides, pauses, idempotency, concurrency, admin rights and the
// ledger behind the analytics. Kotka AI calls go to a local stand-in for the
// NVIDIA API (nothing leaves the machine); research runs with every outside
// source switched off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, stopServer, makeUser, signIn, client, prisma } from './helpers.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { reserveUsage, settleUsage, usageSnapshot, viewRequestKey } from '../../src/lib/usage/index.js';
import { clearUsageConfigCache } from '../../src/lib/usage/config.js';
import { periodStart, periodEnd } from '../../src/lib/usage/periods.js';
import { usageOverview, featureBreakdown } from '../../src/lib/usage/admin.js';

// ── A stand-in for the NVIDIA chat API ──────────────────────────────────────
let aiMode = 'ok';
let aiCalls = 0;
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    aiCalls += 1;
    if (aiMode === 'fail') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end('{"error":"stand-in failure"}');
    }
    const usage = { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 };
    if (JSON.parse(body || '{}').stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'What does your plan say about this setup?' } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'You entered before the candle closed, against your own rule. What would waiting have cost you?' } }], usage }));
  });
});

let trader, other, admin, superAdmin, traderC, otherC, adminC, superC;
let savedLimits, savedControls, savedIntegration, savedResearch, savedApp;
const PLAIN = 'Is my stop too tight here?';

async function setLimit(meter, limits) {
  await prisma.usageLimit.upsert({ where: { scope_meter: { scope: 'default', meter } }, update: { daily: null, weekly: null, monthly: null, enabled: true, ...limits }, create: { scope: 'default', meter, daily: null, weekly: null, monthly: null, ...limits } });
  clearUsageConfigCache();
}
// Each test starts with a clear burst window, so the rate limit (8 a
// minute) only comes into play in the test that is about it.
const calm = (userId) => prisma.rateLimitHit.deleteMany({ where: { key: { contains: userId } } });
async function clearAiUsage(userId) {
  await calm(userId);
  await prisma.usageRecord.deleteMany({ where: { userId } });
  await prisma.usageReset.deleteMany({ where: { userId } });
  await prisma.usageOverride.deleteMany({ where: { userId } });
}
// Counted usage rows placed at a given time (history the test controls).
const addUsage = (userId, feature, action, at, count = 1) => prisma.usageRecord.createMany({ data: Array.from({ length: count }, () => ({ userId, feature, action, units: 1, status: 'consumed', createdAt: at })) });
const counted = (userId, feature) => prisma.usageRecord.aggregate({ where: { userId, feature, status: { in: ['pending', 'consumed', 'abandoned'] } }, _sum: { units: true } }).then((r) => r._sum.units ?? 0);
const snap = async (userId, feature, role = 'trader') => (await usageSnapshot(userId, { role, features: [feature] }))[0];

async function newChat(c, user = c === otherC ? other : trader) {
  await calm(user.id);
  const r = await c.post('/api/ai/conversations', { market: 'Forex' });
  assert.equal(r.status, 201);
  return r.json.conversation.id;
}
const ask = (c, chatId, extra = {}, headers) => c.post(`/api/ai/conversations/${chatId}/messages`, { content: PLAIN, ...extra }, headers);

before(async () => {
  await startServer();
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  savedLimits = await prisma.usageLimit.findMany();
  savedControls = await prisma.featureControl.findMany();
  savedIntegration = await prisma.integration.findUnique({ where: { provider: 'nvidia' } });
  savedResearch = await prisma.researchSettings.findUnique({ where: { id: 'singleton' } });
  savedApp = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const baseUrl = `http://127.0.0.1:${mock.address().port}`;
  await prisma.integration.upsert({ where: { provider: 'nvidia' }, update: { secretCipher: encryptSecret('stand-in-key'), enabled: true, config: { baseUrl } }, create: { provider: 'nvidia', secretCipher: encryptSecret('stand-in-key'), enabled: true, config: { baseUrl } } });
  [trader, other, admin, superAdmin] = await Promise.all([makeUser('Quota'), makeUser('Neighbour'), makeUser('UsageAdmin', { role: 'admin' }), makeUser('UsageSuper', { role: 'super_admin' })]);
  [traderC, otherC, adminC, superC] = await Promise.all([signIn(trader), signIn(other), signIn(admin), signIn(superAdmin)]);
});

after(async () => {
  // Put the shared configuration back exactly as it was.
  await prisma.usageLimit.deleteMany({});
  if (savedLimits.length) await prisma.usageLimit.createMany({ data: savedLimits });
  await prisma.featureControl.deleteMany({});
  if (savedControls.length) await prisma.featureControl.createMany({ data: savedControls });
  if (savedIntegration) await prisma.integration.update({ where: { provider: 'nvidia' }, data: { secretCipher: savedIntegration.secretCipher, enabled: savedIntegration.enabled, config: savedIntegration.config } });
  else await prisma.integration.deleteMany({ where: { provider: 'nvidia' } });
  if (savedResearch) await prisma.researchSettings.update({ where: { id: 'singleton' }, data: { config: savedResearch.config } });
  else await prisma.researchSettings.deleteMany({ where: { id: 'singleton' } });
  if (savedApp) await prisma.appSettings.update({ where: { id: 'singleton' }, data: { config: savedApp.config } });
  else await prisma.appSettings.deleteMany({ where: { id: 'singleton' } });
  const ids = [trader, other, admin, superAdmin].map((u) => u.id);
  await prisma.rateLimitHit.deleteMany({ where: { OR: ids.map((id) => ({ key: { contains: id } })) } });
  await new Promise((r) => mock.close(r));
  await stopServer();
});

// ── Periods ─────────────────────────────────────────────────────────────────

test('periods are UTC days, ISO weeks from Monday and calendar months', () => {
  const wed = new Date('2026-09-30T22:15:00Z'); // a Wednesday
  assert.equal(periodStart('day', wed).toISOString(), '2026-09-30T00:00:00.000Z');
  assert.equal(periodStart('week', wed).toISOString(), '2026-09-28T00:00:00.000Z');
  assert.equal(periodStart('month', wed).toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(periodEnd('day', wed).toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(periodEnd('week', wed).toISOString(), '2026-10-05T00:00:00.000Z');
  assert.equal(periodEnd('month', wed).toISOString(), '2026-10-01T00:00:00.000Z');
  const sunday = new Date('2026-10-04T23:59:59Z');
  assert.equal(periodStart('week', sunday).toISOString(), '2026-09-28T00:00:00.000Z', 'Sunday belongs to the week that started on Monday');
  assert.equal(periodEnd('month', new Date('2026-12-31T12:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
});

// ── Limits ──────────────────────────────────────────────────────────────────

test('a new person gets the default limits, and can use a feature below them', async () => {
  await setLimit('kotka_ai', { daily: 3 });
  const s = await snap(trader.id, 'kotka_ai');
  assert.equal(s.source, 'default');
  assert.equal(s.periods.day.limit, 3);
  assert.equal(s.periods.day.used, 0);
  const r = await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' });
  assert.equal(r.ok, true);
  assert.ok(r.reservation);
  assert.equal(r.usage.day.remaining, 2);
  await clearAiUsage(trader.id);
});

test('the daily limit blocks, with the reset time, and a refusal costs nothing', async () => {
  await setLimit('kotka_ai', { daily: 2 });
  const chat = await newChat(traderC);
  assert.equal((await ask(traderC, chat)).status, 200);
  assert.equal((await ask(traderC, chat)).status, 200);
  const r = await ask(traderC, chat);
  assert.equal(r.status, 429);
  assert.equal(r.json.code, 'usage_limit');
  assert.equal(r.json.reason, 'DAILY_LIMIT_REACHED');
  assert.equal(r.json.resetAt, periodEnd('day').toISOString());
  assert.match(r.json.error, /today’s Kotka AI limit/);
  assert.equal(await counted(trader.id, 'kotka_ai'), 2, 'the refused request is not counted');
  await clearAiUsage(trader.id);
});

test('weekly and monthly limits block on their own', async () => {
  await setLimit('kotka_ai', { weekly: 2 });
  await addUsage(trader.id, 'kotka_ai', 'chat', periodStart('week'), 2);
  let r = await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' });
  assert.equal(r.ok, false);
  assert.equal(r.body.reason, 'WEEKLY_LIMIT_REACHED');
  await clearAiUsage(trader.id);

  await setLimit('kotka_ai', { monthly: 2 });
  await addUsage(trader.id, 'kotka_ai', 'chat', periodStart('month'), 2);
  r = await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' });
  assert.equal(r.ok, false);
  assert.equal(r.body.reason, 'MONTHLY_LIMIT_REACHED');
  assert.equal(r.body.resetAt, periodEnd('month').toISOString());
  await clearAiUsage(trader.id);
});

test('the most restrictive limit wins, and an action limit applies on top of its feature', async () => {
  await setLimit('kotka_ai', { daily: 5, weekly: 2 });
  await addUsage(trader.id, 'kotka_ai', 'chat', new Date(), 2);
  const r = await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' });
  assert.equal(r.ok, false, 'daily has 3 left, but the week is used up');
  assert.equal(r.body.reason, 'WEEKLY_LIMIT_REACHED');
  await clearAiUsage(trader.id);

  await setLimit('kotka_ai', { daily: 10 });
  await setLimit('kotka_ai.chart_analysis', { daily: 1 });
  await addUsage(trader.id, 'kotka_ai', 'chart_analysis', new Date(), 1);
  const chart = await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chart_analysis', role: 'trader' });
  assert.equal(chart.ok, false);
  assert.equal(chart.body.meter, 'kotka_ai.chart_analysis');
  assert.match(chart.body.limitName, /chart reading/);
  const text = await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' });
  assert.equal(text.ok, true, 'plain chat is still allowed');
  await prisma.usageLimit.delete({ where: { scope_meter: { scope: 'default', meter: 'kotka_ai.chart_analysis' } } });
  clearUsageConfigCache();
  await clearAiUsage(trader.id);
});

test('usage from before a period started does not count in it', async () => {
  await setLimit('kotka_ai', { daily: 1, weekly: 100, monthly: 100 });
  const yesterday = new Date(periodStart('day').getTime() - 60e3);
  await addUsage(trader.id, 'kotka_ai', 'chat', yesterday, 3);
  const s = await snap(trader.id, 'kotka_ai');
  assert.equal(s.periods.day.used, 0);
  assert.equal(s.periods.week.used, yesterday >= periodStart('week') ? 3 : 0);
  assert.equal(s.periods.month.used, yesterday >= periodStart('month') ? 3 : 0);
  assert.equal((await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' })).ok, true);
  await clearAiUsage(trader.id);
});

// ── What counts ─────────────────────────────────────────────────────────────

test('a failed AI request is recorded but not counted; a partial or full answer is', async () => {
  await setLimit('kotka_ai', { daily: 5 });
  const chat = await newChat(traderC);
  aiMode = 'fail';
  const r = await ask(traderC, chat);
  aiMode = 'ok';
  assert.equal(r.status, 200, 'the reply streams an apology');
  assert.match(r.json, /having a moment/);
  const rows = await prisma.usageRecord.findMany({ where: { userId: trader.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'failed');
  assert.equal(await counted(trader.id, 'kotka_ai'), 0);
  const res = await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' });
  await settleUsage(res.reservation, 'released');
  assert.equal(await counted(trader.id, 'kotka_ai'), 0, 'released work costs nothing');
  await clearAiUsage(trader.id);
});

test('Kotka AI usage is recorded with action, provider, model, tokens and time', async () => {
  await setLimit('kotka_ai', { daily: 50 });
  const chat = await newChat(traderC);
  assert.equal((await ask(traderC, chat)).status, 200);
  let row = await prisma.usageRecord.findFirst({ where: { userId: trader.id }, orderBy: { createdAt: 'desc' } });
  assert.equal(row.feature, 'kotka_ai');
  assert.equal(row.action, 'chat');
  assert.equal(row.status, 'consumed');
  assert.equal(row.provider, 'nvidia');
  assert.ok(row.model?.includes('/'), 'the model that answered');
  assert.deepEqual([row.inputTokens, row.outputTokens, row.totalTokens], [120, 30, 150]);
  assert.ok(row.latencyMs >= 0 && row.settledAt);

  // A chart image makes it a chart reading.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await ask(traderC, chat, { image: png })).status, 200);
  row = await prisma.usageRecord.findFirst({ where: { userId: trader.id }, orderBy: { createdAt: 'desc' } });
  assert.equal(row.action, 'chart_analysis');

  // A trade review is its own action.
  const entry = await prisma.journalEntry.create({ data: { userId: trader.id, date: '2026-09-28', market: 'EURUSD', session: 'London', strategy: 'Breakout', direction: 'Long', entry: 1.1, stopLoss: 1.09, takeProfit: 1.12, risk: 1, reward: 2, result: 'Loss', pnl: -1, emotionBefore: 'Calm', emotionAfter: 'Frustrated', confidence: 3, mistakes: 'Entered before the candle closed' } });
  const review = await traderC.post(`/api/journal/${entry.id}/review`, {});
  assert.equal(review.status, 200);
  row = await prisma.usageRecord.findFirst({ where: { userId: trader.id }, orderBy: { createdAt: 'desc' } });
  assert.equal(row.action, 'trade_review');
  assert.equal(row.totalTokens, 150);
  await prisma.journalEntry.delete({ where: { id: entry.id } });
  await clearAiUsage(trader.id);
});

test('parallel requests cannot get past a limit', async () => {
  await setLimit('kotka_ai', { daily: 3 });
  const results = await Promise.all(Array.from({ length: 10 }, () => reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' })));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.equal(await counted(trader.id, 'kotka_ai'), 3);
  await clearAiUsage(trader.id);

  // The same through the API, all at once.
  await setLimit('kotka_ai', { daily: 2 });
  const chat = await newChat(traderC);
  const replies = await Promise.all(Array.from({ length: 6 }, () => ask(traderC, chat)));
  assert.equal(replies.filter((r) => r.status === 200).length, 2);
  assert.ok(replies.filter((r) => r.status === 429).every((r) => r.json.code === 'usage_limit' || r.json.code === 'rate_limited'));
  assert.equal(await counted(trader.id, 'kotka_ai'), 2);
  await clearAiUsage(trader.id);
});

test('nothing the client sends changes what is counted or for whom', async () => {
  await setLimit('kotka_ai', { daily: 1 });
  const chat = await newChat(traderC);
  const r = await traderC.post(`/api/ai/conversations/${chat}/messages`, { content: PLAIN, units: -5, feature: 'market_intelligence', action: 'none', userId: other.id }, { 'X-User-Id': other.id });
  assert.equal(r.status, 200);
  assert.equal(await counted(trader.id, 'kotka_ai'), 1, 'one unit, on the sender');
  assert.equal(await prisma.usageRecord.count({ where: { userId: other.id } }), 0);
  // At the limit, calling the API directly is refused too.
  assert.equal((await ask(traderC, chat)).status, 429);
  // Another person's usage is untouched and separate.
  assert.equal((await snap(other.id, 'kotka_ai')).periods.day.used, 0);
  const mine = await otherC.get('/api/usage?userId=' + trader.id);
  assert.equal(mine.json.features.find((f) => f.feature === 'kotka_ai').periods.day.used, 0, 'a user parameter is ignored: people only see their own');
  await clearAiUsage(trader.id);
});

test('the engine refuses bad units and unknown features or actions', async () => {
  for (const units of [0, -1, 1.5, 1001, Number.MAX_SAFE_INTEGER, '3']) {
    await assert.rejects(reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', units, role: 'trader' }), RangeError);
  }
  await assert.rejects(reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'mine_bitcoin' }), TypeError);
  await assert.rejects(reserveUsage({ userId: trader.id, feature: 'free_stuff', action: 'chat' }), TypeError);
  await assert.rejects(reserveUsage({ userId: '', feature: 'kotka_ai', action: 'chat' }), TypeError);
  assert.equal(await prisma.usageRecord.count({ where: { userId: trader.id } }), 0);
});

test('a repeated request key is not counted twice; a failed one can be retried', async () => {
  await setLimit('kotka_ai', { daily: 10 });
  const chat = await newChat(traderC);
  const key = { 'Idempotency-Key': 'retry-key-0001' };
  assert.equal((await ask(traderC, chat, {}, key)).status, 200);
  const again = await ask(traderC, chat, {}, key);
  assert.equal(again.status, 409);
  assert.equal(again.json.code, 'duplicate_request');
  assert.equal(await counted(trader.id, 'kotka_ai'), 1);

  aiMode = 'fail';
  await ask(traderC, chat, {}, { 'Idempotency-Key': 'retry-key-0002' });
  aiMode = 'ok';
  assert.equal((await ask(traderC, chat, {}, { 'Idempotency-Key': 'retry-key-0002' })).status, 200, 'a failed attempt frees its key');
  assert.equal(await counted(trader.id, 'kotka_ai'), 2);
  assert.equal(await prisma.usageRecord.count({ where: { userId: trader.id, status: 'failed' } }), 1, 'the failed attempt stays in the history');
  await clearAiUsage(trader.id);
});

test('rate limits work on their own, separately from usage limits', async () => {
  await setLimit('kotka_ai', { daily: 1000 });
  const chat = await newChat(otherC);
  const statuses = [];
  for (let i = 0; i < 9; i++) statuses.push(await ask(otherC, chat));
  const limited = statuses.filter((r) => r.status === 429);
  assert.equal(limited.length, 1, 'the 9th in a minute is too fast');
  assert.equal(limited[0].json.code, 'rate_limited');
  assert.equal(await counted(other.id, 'kotka_ai'), 8, 'a rate-limited request is never counted');
  assert.equal((await snap(other.id, 'kotka_ai')).status, 'ok', 'and it is not reported as a usage limit');
  await clearAiUsage(other.id);
});

// ── Market Intelligence and Fundamental Research ───────────────────────────

test('Market Intelligence views are counted once per view and window, and limited', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const keys = ['fomc', 'bls', 'bea', 'ecb', 'eurostat'].map((k) => `calendar:${k}:${today}`);
  const existing = await prisma.researchSourceCache.findMany({ where: { key: { in: keys } } });
  // Today's calendars come from the cache, so the test needs no outside site.
  for (const key of keys) {
    if (!existing.some((e) => e.key === key)) await prisma.researchSourceCache.create({ data: { key, payload: [], fetchedAt: new Date(), expiresAt: new Date(Date.now() + 3600e3) } });
  }
  try {
    await setLimit('market_intelligence', { daily: 2 });
    assert.equal((await traderC.get('/api/market/calendar?days=14')).status, 200);
    assert.equal((await traderC.get('/api/market/calendar?days=14')).status, 200, 'the same view again');
    let rows = await prisma.usageRecord.findMany({ where: { userId: trader.id, feature: 'market_intelligence' } });
    assert.equal(rows.length, 1, 'counted once');
    assert.equal(rows[0].action, 'economic_calendar');
    assert.equal(rows[0].status, 'consumed');
    assert.ok(rows[0].metadata.cacheHits >= 5, 'served from the cache, and recorded as such');
    assert.equal(rows[0].provider, null, 'no outside provider was called');

    assert.equal((await traderC.get('/api/market/calendar?days=30')).status, 200, 'a different view');
    const blocked = await traderC.get('/api/market/calendar?days=7');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.code, 'usage_limit');
    assert.match(blocked.json.error, /Market Intelligence limit/);

    // Prices with no price source set up: shown, recorded, not counted.
    await setLimit('market_intelligence', { daily: 100 });
    const pulse = await traderC.get('/api/market/pulse');
    assert.equal(pulse.status, 200);
    rows = await prisma.usageRecord.findMany({ where: { userId: trader.id, action: 'market_pulse' } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, pulse.json.configured ? 'consumed' : 'released');
    assert.equal(viewRequestKey('market_pulse', 'all').startsWith('v:market_pulse:all:'), true);
  } finally {
    await prisma.researchSourceCache.deleteMany({ where: { key: { in: keys.filter((k) => !existing.some((e) => e.key === k)) } } });
    await clearAiUsage(trader.id);
  }
});

test('Fundamental Research: only an update that runs is counted, and the limit and pause are explained', async () => {
  const offline = { enabled: true, aiNarrative: false, sources: Object.fromEntries(['imf_weo', 'imf_cofer', 'fred', 'ecb', 'eurostat', 'bis', 'statements', 'calendars'].map((k) => [k, false])) };
  await prisma.researchSettings.upsert({ where: { id: 'singleton' }, update: { config: { ...(savedResearch?.config ?? {}), ...offline } }, create: { id: 'singleton', config: offline } });
  await setLimit('fundamental_research', { daily: 1 });
  // Saved reports from earlier runs are made stale for this test (and put back after), so an update really runs.
  const before = await prisma.researchReport.findMany({ where: { subject: { in: ['USD', 'EUR'] } }, select: { id: true, createdAt: true } });
  for (const r of before) await prisma.researchReport.update({ where: { id: r.id }, data: { createdAt: new Date(r.createdAt.getTime() - 60 * 86400e3) } });
  try {
    const run = await traderC.post('/api/research/USD/refresh', { force: true });
    assert.equal(run.status, 200);
    const rows = await prisma.usageRecord.findMany({ where: { userId: trader.id, feature: 'fundamental_research' } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'report_update');
    assert.equal(rows[0].metadata.subject, 'USD');
    assert.equal(rows[0].status, 'consumed', 'the update ran');
    assert.equal(rows[0].metadata.upstream, undefined, 'no outside source was called');

    // A fresh report is served from the cache: nothing counted.
    const cached = await traderC.post('/api/research/USD/refresh', {});
    assert.equal(cached.status, 200);
    assert.equal(cached.json.cached, true);
    assert.equal(await prisma.usageRecord.count({ where: { userId: trader.id, feature: 'fundamental_research' } }), 1);

    // At the limit, a stale report can't be updated but is still readable.
    await addUsage(trader.id, 'fundamental_research', 'report_update', new Date(), 1);
    const limited = await traderC.post('/api/research/EUR/refresh', {});
    assert.equal(limited.status, 429);
    assert.match(limited.json.error, /still read the last saved report/);
    assert.equal((await traderC.get('/api/research/USD')).status, 200, 'reading is never limited');

    // Paused: a clear "temporarily unavailable", not a limit message.
    await superC.put('/api/admin/usage/features/fundamental_research', { enabled: false, note: 'test' });
    await setLimit('fundamental_research', { daily: 100 });
    const paused = await traderC.post('/api/research/EUR/refresh', {});
    assert.equal(paused.status, 503);
    assert.equal(paused.json.code, 'feature_paused');
    assert.match(paused.json.error, /temporarily unavailable/);
    await superC.put('/api/admin/usage/features/fundamental_research', { enabled: true });
  } finally {
    await prisma.researchReport.deleteMany({ where: { subject: { in: ['USD', 'EUR'] }, id: { notIn: before.map((b) => b.id) } } });
    for (const r of before) await prisma.researchReport.update({ where: { id: r.id }, data: { createdAt: r.createdAt } });
    await prisma.researchRun.deleteMany({ where: { userId: trader.id } });
    await clearAiUsage(trader.id);
  }
});

test('a paused feature is refused for everyone, staff included, and says so plainly', async () => {
  await setLimit('kotka_ai', { daily: 100 });
  assert.equal((await adminC.put('/api/admin/usage/features/kotka_ai', { enabled: false, note: 'provider outage' })).status, 200);
  const chat = await newChat(traderC);
  const r = await ask(traderC, chat);
  assert.equal(r.status, 503);
  assert.equal(r.json.code, 'feature_paused');
  assert.equal((await reserveUsage({ userId: admin.id, feature: 'kotka_ai', action: 'chat', role: 'admin' })).ok, false);
  assert.equal((await snap(trader.id, 'kotka_ai')).paused, true);
  assert.equal((await adminC.put('/api/admin/usage/features/kotka_ai', { enabled: true })).status, 200);
  assert.equal((await ask(traderC, chat)).status, 200);
  const audit = await prisma.auditLog.findMany({ where: { actorId: admin.id, action: { in: ['usage.feature_paused', 'usage.feature_resumed'] } } });
  assert.equal(audit.length, 2);
  await clearAiUsage(trader.id);
});

// ── Admin control ───────────────────────────────────────────────────────────

test('only a super admin changes default limits; others are refused', async () => {
  assert.equal((await traderC.put('/api/admin/usage/limits/kotka_ai', { daily: 99999 })).status, 403);
  assert.equal((await adminC.put('/api/admin/usage/limits/kotka_ai', { daily: 99999 })).status, 403);
  assert.equal((await traderC.get('/api/admin/usage/overview')).status, 403);
  assert.equal((await client().get('/api/admin/usage/overview')).status, 401);

  const r = await superC.put('/api/admin/usage/limits/kotka_ai', { daily: 7, weekly: 20, monthly: null, warnAtPct: 75, enabled: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.limit.daily, 7);
  assert.equal((await snap(trader.id, 'kotka_ai')).periods.day.limit, 7, 'takes effect without a deploy');
  const audit = await prisma.auditLog.findFirst({ where: { actorId: superAdmin.id, action: 'usage.limit_updated' }, orderBy: { createdAt: 'desc' } });
  assert.equal(audit.detail.changes.daily.to, 7);

  for (const bad of [{ daily: -1 }, { daily: 1.5 }, { daily: 2_000_000 }, { daily: 'lots' }, { warnAtPct: 0 }, { enabled: 'yes' }]) {
    assert.equal((await superC.put('/api/admin/usage/limits/kotka_ai', bad)).status, 400, JSON.stringify(bad));
  }
  for (const meter of ['kotka_ai.nope', 'kotka_ai.chat.extra', 'free_stuff', "'; DROP TABLE x;--"]) {
    assert.equal((await superC.put(`/api/admin/usage/limits/${encodeURIComponent(meter)}`, { daily: 1 })).status, 400, meter);
  }
  assert.equal((await superC.delete('/api/admin/usage/limits/kotka_ai')).status, 400, 'a feature limit is switched off, not removed');
});

test('a person’s own limits take precedence, and stop when they expire', async () => {
  await setLimit('kotka_ai', { daily: 2 });
  const r = await adminC.post(`/api/admin/usage/users/${trader.id}/overrides`, { meter: 'kotka_ai', daily: 5, reason: 'beta tester' });
  assert.equal(r.status, 201);
  let s = await snap(trader.id, 'kotka_ai');
  assert.equal(s.source, 'override');
  assert.equal(s.periods.day.limit, 5);
  await addUsage(trader.id, 'kotka_ai', 'chat', new Date(), 4);
  assert.equal((await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' })).ok, true, 'past the default, within their own');

  // Expired: back to everyone's limits.
  await prisma.usageOverride.update({ where: { id: r.json.override.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  s = await snap(trader.id, 'kotka_ai');
  assert.equal(s.source, 'default');
  assert.equal(s.periods.day.limit, 2);
  assert.equal((await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' })).ok, false);

  // Validation, and people who aren't admins.
  assert.equal((await adminC.post(`/api/admin/usage/users/${trader.id}/overrides`, { meter: 'kotka_ai', daily: 5, reason: 'x' })).status, 400, 'a reason is required');
  assert.equal((await adminC.post(`/api/admin/usage/users/${trader.id}/overrides`, { meter: 'kotka_ai', daily: 5, reason: 'tester', expiresAt: '2020-01-01T00:00:00Z' })).status, 400, 'an end in the past');
  assert.equal((await adminC.post(`/api/admin/usage/users/${trader.id}/overrides`, { meter: 'nope', daily: 5, reason: 'tester' })).status, 400);
  assert.equal((await traderC.post(`/api/admin/usage/users/${trader.id}/overrides`, { meter: 'kotka_ai', daily: 9999, reason: 'myself' })).status, 403);
  assert.ok(await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: 'usage.override_created', targetId: trader.id } }));
  await clearAiUsage(trader.id);
});

test('an admin reset starts the count again without deleting history', async () => {
  await setLimit('kotka_ai', { daily: 2, weekly: 2 });
  await addUsage(trader.id, 'kotka_ai', 'chat', new Date(Date.now() - 60e3), 2);
  assert.equal((await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' })).ok, false);
  const before = await prisma.usageRecord.count({ where: { userId: trader.id } });

  assert.equal((await traderC.post(`/api/admin/usage/users/${other.id}/reset`, { feature: 'kotka_ai', period: 'day' })).status, 403, 'people can’t reset anyone’s usage');
  assert.equal((await adminC.post(`/api/admin/usage/users/${trader.id}/reset`, { feature: 'kotka_ai', period: 'year' })).status, 400);

  assert.equal((await adminC.post(`/api/admin/usage/users/${trader.id}/reset`, { feature: 'kotka_ai', period: 'day', reason: 'support ticket' })).status, 201);
  let s = await snap(trader.id, 'kotka_ai');
  assert.equal(s.periods.day.used, 0, 'today starts again');
  assert.equal(s.periods.week.used, 2, 'the week is untouched');
  assert.equal((await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' })).ok, false, 'still blocked by the week');

  assert.equal((await adminC.post(`/api/admin/usage/users/${trader.id}/reset`, { feature: 'kotka_ai', period: 'week' })).status, 201);
  s = await snap(trader.id, 'kotka_ai');
  assert.equal(s.periods.week.used, 0);
  assert.equal((await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' })).ok, true);
  assert.equal(await prisma.usageRecord.count({ where: { userId: trader.id } }), before + 1, 'nothing was deleted');
  assert.equal((await snap(other.id, 'kotka_ai')).periods.week.used, 0, 'only the intended person');
  assert.ok(await prisma.auditLog.findFirst({ where: { actorId: admin.id, action: 'usage.reset', targetId: trader.id } }));
  await clearAiUsage(trader.id);
});

test('staff exemption: staff use is recorded but not limited, and can be switched off', async () => {
  await setLimit('kotka_ai', { daily: 1 });
  await addUsage(admin.id, 'kotka_ai', 'chat', new Date(), 3);
  const r = await reserveUsage({ userId: admin.id, feature: 'kotka_ai', action: 'chat', role: 'admin' });
  assert.equal(r.ok, true);
  assert.equal((await prisma.usageRecord.findUnique({ where: { id: r.reservation } })).metadata.exempt, true);
  assert.equal((await adminC.put('/api/admin/usage/settings', { staffExempt: false })).status, 403);
  assert.equal((await superC.put('/api/admin/usage/settings', { staffExempt: false })).status, 200);
  assert.equal((await reserveUsage({ userId: admin.id, feature: 'kotka_ai', action: 'chat', role: 'admin' })).ok, false);
  assert.equal((await superC.put('/api/admin/usage/settings', { staffExempt: true })).status, 200);
  await clearAiUsage(admin.id);
});

test('the analytics add up to the ledger', async () => {
  await setLimit('kotka_ai', { daily: 1 });
  await addUsage(trader.id, 'kotka_ai', 'chat', new Date(), 1);
  await addUsage(other.id, 'kotka_ai', 'trade_review', new Date(), 2);
  await reserveUsage({ userId: trader.id, feature: 'kotka_ai', action: 'chat', role: 'trader' }); // refused: recorded as blocked
  const overview = await usageOverview();
  const ai = overview.features.find((f) => f.feature === 'kotka_ai');
  const [{ units, users }] = await prisma.$queryRaw`SELECT COALESCE(SUM("units"), 0)::int AS units, COUNT(DISTINCT "userId")::int AS users FROM "UsageRecord" WHERE "feature" = 'kotka_ai' AND "status" IN ('pending', 'consumed', 'abandoned') AND "createdAt" >= ${periodStart('day')}`;
  assert.equal(ai.units.day, units);
  assert.equal(ai.activeUsers.day, users);
  assert.ok(ai.reachedLimit.daily.today >= 1, 'the refused person shows up as having reached the daily limit');
  assert.ok(overview.people.some((p) => p.userId === trader.id && p.status === 'reached'));
  const detail = await featureBreakdown('kotka_ai');
  assert.equal(detail.actions.reduce((s, a) => s + a.units.day, 0), units, 'per-action totals match');
  const api = await adminC.get('/api/admin/usage/overview');
  assert.equal(api.status, 200);
  const logs = await adminC.get(`/api/admin/usage/records?userId=${trader.id}&feature=kotka_ai`);
  assert.equal(logs.status, 200);
  assert.equal(logs.json.records.length, await prisma.usageRecord.count({ where: { userId: trader.id, feature: 'kotka_ai' } }));
  assert.equal((await adminC.get('/api/admin/usage/records?status=everything')).status, 400);
  await clearAiUsage(trader.id);
  await clearAiUsage(other.id);
});
