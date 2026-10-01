// Operations and support: error reports are cleaned of anything personal,
// the status page shows real checks, the status probe needs its token,
// support requests stay private to their trader, and staff pages are staff-only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, makeUser, signIn, client, prisma, runTag } from './helpers.js';
import { recordError, scrub, routeOf } from '../../src/lib/ops/errors.js';
import { recordStatusSample } from '../../src/lib/ops/status.js';
import { collectDigest } from '../../src/lib/ops/alerts.js';

let base, alice, bob, admin, aliceC, bobC, adminC;
const marker = `ops-${runTag}`;

before(async () => {
  base = await startServer();
  [alice, bob, admin] = await Promise.all([makeUser('OpsAlice'), makeUser('OpsBob'), makeUser('OpsAdmin', { role: 'admin' })]);
  [aliceC, bobC, adminC] = await Promise.all([signIn(alice), signIn(bob), signIn(admin)]);
});

after(async () => {
  await prisma.errorGroup.deleteMany({ where: { message: { contains: marker } } });
  await prisma.supportTicket.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
  await prisma.activityDay.deleteMany({ where: { userId: { in: [alice.id, bob.id, admin.id] } } });
  await stopServer();
});

test('error reports are cleaned of emails, tokens, query strings and long numbers before storing', async () => {
  assert.equal(scrub('failed for ada@example.com at /reset-password?token=abc'), 'failed for <email> at /reset-password');
  assert.match(scrub('bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl'), /<jwt>/);
  assert.equal(scrub('account 12345678 ok'), 'account <n> ok');
  assert.equal(routeOf('/api/game/matches/cmuo8p9jv002310yvtrrjy2cu/state?ticks=1'), '/api/game/matches/:id/state');
  const r = await fetch(`${base}/api/telemetry/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: aliceC.cookie },
    body: JSON.stringify({ errors: [{ message: `${marker} boom for ${alice.email} token=QWERTYUIOPASDFGHJKLZXCVBNM1234567890`, stack: `Error\n    at render (https://www.kotkafinance.online/assets/Journal-AbCdEf12.js:1:200)`, path: '/app/journal?x=secret' }], sample: { browser: 'Chrome on Android', screen: '390x844' } }),
  });
  assert.equal(r.status, 204);
  let g = null;
  for (let i = 0; i < 20 && !g; i++) {
    g = await prisma.errorGroup.findFirst({ where: { message: { contains: marker } } });
    if (!g) await new Promise((res) => setTimeout(res, 250));
  }
  assert.ok(g, 'recorded');
  assert.ok(!g.message.includes(alice.email), 'no email address');
  assert.ok(!g.message.includes('QWERTYUIOPASDFGHJKLZXCVBNM'), 'no token');
  assert.equal(g.path, '/app/journal', 'no query string');
  assert.equal(g.source, 'client');
  assert.equal(g.lastUserId, alice.id);
});

test('the same error groups together, and a fixed one reopens if it comes back', async () => {
  const one = await recordError({ source: 'server', message: `${marker} same thing 1`, stack: 'Error\n    at x (file:///app/src/routes/a.js:10:5)', path: 'GET /api/a' });
  await new Promise((r) => setTimeout(r, 1100));
  const two = await recordError({ source: 'server', message: `${marker} same thing 2`, stack: 'Error\n    at x (file:///app/src/routes/a.js:10:5)', path: 'GET /api/a' });
  assert.equal(one.id, two.id, 'numbers in the message don’t split the group');
  assert.equal((await prisma.errorGroup.findUnique({ where: { id: one.id } })).count, 2);
  assert.equal((await aliceC.patch(`/api/admin/errors/${one.id}`, { status: 'resolved' })).status, 403, 'traders can’t manage errors');
  assert.equal((await adminC.patch(`/api/admin/errors/${one.id}`, { status: 'resolved' })).status, 200);
  await new Promise((r) => setTimeout(r, 1100));
  await recordError({ source: 'server', message: `${marker} same thing 3`, stack: 'Error\n    at x (file:///app/src/routes/a.js:10:5)', path: 'GET /api/a' });
  assert.equal((await prisma.errorGroup.findUnique({ where: { id: one.id } })).status, 'open', 'back again: reopened');
  const digest = await collectDigest({ daily: false });
  assert.ok(digest.items.some((i) => i.text.includes(marker)), 'and in the next ops digest');
  const list = await adminC.get('/api/admin/errors?status=open');
  assert.ok(list.json.errors.some((e) => e.id === one.id));
  assert.equal((await client().get('/api/admin/errors')).status, 401);
});

test('the status page shows live checks; the probe needs the scheduled job’s token', async () => {
  await recordStatusSample();
  const s = await client().get('/api/status');
  assert.equal(s.status, 200);
  assert.ok(['ok', 'degraded', 'down'].includes(s.json.overall));
  assert.ok(s.json.components.find((c) => c.key === 'data' && c.state === 'ok'), 'the database check ran');
  assert.ok(s.json.history.every((h) => h.days.length === 90));
  assert.ok(s.json.history.find((h) => h.key === 'data').days.at(-1).samples >= 1, 'today has a real sample');
  assert.equal((await client().get('/api/status/probe')).status, 401);
  assert.equal((await client().get('/api/status/probe?token=wrong')).status, 401);
});

test('support requests stay private; match reports must be for your own match', async () => {
  const made = await aliceC.post('/api/support/tickets', { topic: 'payments', subject: `Deposit question ${runTag}`, body: 'My deposit shows as waiting. What should I do?' });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  const id = made.json.ticket.id;
  assert.equal((await bobC.get(`/api/support/tickets/${id}`)).status, 404, 'someone else’s request is invisible');
  assert.equal((await bobC.post(`/api/support/tickets/${id}/messages`, { body: 'hijack' })).status, 404);
  assert.equal((await aliceC.get('/api/admin/support')).status, 403, 'traders can’t open the inbox');
  const other = await makeUser('OpsCarol');
  const m = await prisma.gameMatch.create({ data: { code: `T${runTag}`.slice(0, 7).toUpperCase(), mode: 'practice', status: 'SETTLED', scenario: 'bull_trend', scenarioCode: 'KTK-0101', seed: 1, generatorVersion: 3, marketHash: 'x', durationSec: 60, candleSec: 5, historyCandles: 30, startingCapital: 100000, creatorId: other.id, settledAt: new Date(), players: { create: { userId: other.id, role: 'solo' } } } });
  const notMine = await aliceC.post('/api/support/tickets', { topic: 'match', matchId: m.id, subject: 'Wrong result', body: 'This match was scored wrongly.' });
  assert.equal(notMine.status, 400, 'can’t report a match you didn’t play');
  await prisma.gameMatch.delete({ where: { id: m.id } });
  // Staff reply: the trader sees it, the request shows as answered.
  const reply = await adminC.post(`/api/admin/support/${id}/messages`, { body: 'Deposits are added when the provider confirms. Yours is confirmed now.' });
  assert.equal(reply.status, 201);
  const mine = await aliceC.get(`/api/support/tickets/${id}`);
  assert.equal(mine.json.ticket.status, 'answered');
  assert.equal(mine.json.ticket.messages.at(-1).fromStaff, true);
});

test('growth numbers and error lists are for staff; Get started ticks what you did', async () => {
  assert.equal((await aliceC.get('/api/admin/stats/growth')).status, 403);
  const g = await adminC.get('/api/admin/stats/growth?days=30');
  assert.equal(g.status, 200);
  assert.equal(g.json.funnel[0].label, 'Signed up');
  assert.ok(g.json.cohorts.length === 8);
  // Signing in and using the app records today once.
  await aliceC.get('/api/auth/me');
  const today = new Date().toISOString().slice(0, 10);
  let row = null;
  for (let i = 0; i < 20 && !row; i++) {
    row = await prisma.activityDay.findUnique({ where: { userId_day: { userId: alice.id, day: today } } });
    if (!row) await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(row, 'today is recorded');
  const gs = await aliceC.get('/api/me/getting-started');
  assert.equal(gs.status, 200);
  assert.equal(gs.json.steps.find((s) => s.key === 'identity').done, true, 'makeUser comes verified');
  assert.equal(gs.json.steps.find((s) => s.key === 'journal').done, false);
});
