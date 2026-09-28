// Integrity of self-reported and computed data: Goal Room, public share
// links, Kotka AI isolation and quota, and a check that every API route
// needs sign-in unless it is deliberately public.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, makeUser, signIn, client, prisma } from './helpers.js';
import { app } from '../../src/app.js';
import { executeToolCall } from '../../src/lib/aiTools.js';
import { reserveUsage, usageSnapshot } from '../../src/lib/usage/index.js';

let alice, bob, aliceC;
before(async () => {
  await startServer();
  [alice, bob] = await Promise.all([makeUser('Alice'), makeUser('Bob')]);
  aliceC = await signIn(alice);
});
after(stopServer);

test('check-ins cannot be backdated to build a streak', async () => {
  const r = await aliceC.post('/api/goals/checkins', { date: '2026-01-01', traded: false });
  assert.equal(r.status, 201);
  const rows = await prisma.goalCheckIn.findMany({ where: { userId: alice.id } });
  assert.ok(rows.every((c) => c.date !== '2026-01-01'));
});

test('achievements cannot be granted or upgraded by the client', async () => {
  await aliceC.post('/api/goals/goals', { metric: 'checkins', target: 5, periodDays: 7, title: 'Five check-ins' });
  const a = await prisma.achievement.findFirst({ where: { userId: alice.id } });
  await aliceC.patch(`/api/goals/achievements/${a.id}`, { verification: 'verified', type: 'badge', title: 'Millionaire', data: { profit: 1e9 } });
  const after = await prisma.achievement.findUnique({ where: { id: a.id } });
  assert.equal(after.verification, a.verification);
  assert.equal(after.type, a.type);
  assert.equal(after.title, a.title);
});

test('public share links show only the chosen snapshot, and stop when revoked', async () => {
  const a = await prisma.achievement.findFirst({ where: { userId: alice.id } });
  const share = await aliceC.post('/api/goals/shares', { source: 'achievement', sourceId: a.id });
  assert.equal(share.status, 201);
  const anon = client();
  const pub = await anon.get(`/api/public/achievements/${share.json.share.slug}`);
  assert.equal(pub.status, 200);
  const text = JSON.stringify(pub.json);
  assert.ok(!text.includes(alice.email), 'no email');
  assert.ok(!text.includes(alice.id), 'no internal user id');
  assert.ok(!text.includes('passwordHash'));
  await aliceC.delete(`/api/goals/shares/${share.json.share.id}`);
  assert.equal((await anon.get(`/api/public/achievements/${share.json.share.slug}`)).status, 404);
  assert.equal((await anon.get('/api/public/achievements/%27%20OR%201=1--')).status, 404);
});

test("Kotka AI tools only ever read the caller's own journal", async () => {
  const base = { session: 'London', entry: 1, stopLoss: 1, takeProfit: 1, risk: 1, reward: 1, emotionBefore: 'Calm', confidence: 5 };
  await prisma.journalEntry.createMany({
    data: [
      { ...base, userId: alice.id, date: '2026-09-01', market: 'EUR/USD', strategy: 'ALICE-ONLY', direction: 'Long', result: 'win', pnl: 10, positionStatus: 'closed' },
      { ...base, userId: bob.id, date: '2026-09-01', market: 'GBP/USD', strategy: 'BOB-PRIVATE', direction: 'Short', result: 'loss', pnl: -5, positionStatus: 'closed' },
    ],
  });
  const result = JSON.stringify(await executeToolCall('get_recent_trades', { limit: 50, userId: bob.id }, alice.id));
  assert.ok(result.includes('ALICE-ONLY'));
  assert.ok(!result.includes('BOB-PRIVATE'), "arguments can't redirect a tool to another person");
});

test('the daily Kotka AI cap holds under parallel requests', async () => {
  const [ai] = await usageSnapshot(bob.id, { features: ['kotka_ai'] });
  const limit = ai.periods.day.limit;
  if (limit === null) return; // uncapped in this environment
  await prisma.usageRecord.createMany({ data: Array.from({ length: limit - 1 }, () => ({ userId: bob.id, feature: 'kotka_ai', action: 'chat', status: 'consumed' })) });
  const results = await Promise.all(Array.from({ length: 6 }, () => reserveUsage({ userId: bob.id, feature: 'kotka_ai', action: 'chat' })));
  assert.equal(results.filter((r) => r.reservation).length, 1);
});

// Every route, found by walking the Express app, must refuse signed-out
// requests unless it is on this list of deliberately public routes.
const PUBLIC = [
  'GET /api/health',
  'POST /api/auth/signup',
  'POST /api/auth/login',
  'POST /api/auth/login/mfa',
  'POST /api/auth/logout',
  'POST /api/auth/password-reset',
  'GET /api/auth/password-reset/check',
  'POST /api/auth/password-reset/confirm',
  'POST /api/auth/verify-email',
  'GET /api/app/config',
  'GET /api/public/achievements/:slug',
  'GET /api/public/achievements/:slug/image',
  'GET /achievement/:slug',
  'ALL /api/research/cron',
  // Payment providers, verified by signature instead of a session.
  'POST /api/game/webhooks/whop',
  'POST /api/game/webhooks/paystack',
];

function mountPath(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  const src = layer.regexp.source;
  const m = /^\^(.*?)\\\/\?\(\?=\\\/\|\$\)$/.exec(src);
  return m ? m[1].replace(/\\\//g, '/') : null;
}

function routes(stack, prefix = '') {
  const out = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) out.push({ method: method === '_all' ? 'ALL' : method.toUpperCase(), path: prefix + layer.route.path });
    } else if (layer.handle?.stack) {
      const p = mountPath(layer);
      if (p !== null) out.push(...routes(layer.handle.stack, prefix + p));
    }
  }
  return out;
}

test('every non-public API route requires sign-in', async () => {
  const all = routes(app._router.stack).filter((r) => typeof r.path === 'string');
  assert.ok(all.length > 150, `found ${all.length} routes`);
  const anon = client();
  const failures = [];
  for (const r of all) {
    if (PUBLIC.includes(`${r.method} ${r.path}`)) continue;
    const path = r.path.replace(/:list\([^)]*\)/, 'followers').replace(/:(\w+)/g, 'x1');
    const method = r.method === 'ALL' ? 'GET' : r.method;
    const res = await anon[method.toLowerCase() === 'delete' ? 'delete' : method.toLowerCase()](path, method === 'GET' ? undefined : {});
    if (res.status !== 401) failures.push(`${r.method} ${r.path} -> ${res.status}`);
  }
  assert.deepEqual(failures, []);
});
