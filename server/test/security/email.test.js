// Email flows: welcome/confirmation, password reset, security alerts.
// Emails are captured in memory (nothing is sent).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, makeUser, client, signIn, prisma, PASSWORD, runTag } from './helpers.js';
import { captureEmails } from '../../src/lib/email/send.js';

const outbox = captureEmails();
const wait = () => new Promise((r) => setTimeout(r, 400));
// Emails go out after the response; wait until one arrives (or give up).
async function mailFor(email, match) {
  for (let i = 0; i < 40; i++) {
    const m = outbox.find((x) => x.to === email && match(x));
    if (m) return m;
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}
const linkToken = (mail, path) => new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(mail.text)?.[1];
const mailsTo = (email) => outbox.filter((m) => m.to === email);

before(startServer);
after(stopServer);

test('sign-up sends one welcome email whose link confirms the address, once', async () => {
  const email = `new.${runTag}.joiner@kotka.test`;
  const c = client();
  const r = await c.post('/api/auth/signup', { name: 'New Joiner', email, password: 'Plenty-Long-Passphrase-3' });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.emailVerified, false);
  const mail = await mailFor(email, (m) => m.tag === 'welcome');
  assert.ok(mail, 'welcome email sent');
  assert.ok(!mail.html.includes('<script'), 'no active content');
  const token = linkToken(mail, '/verify-email');
  assert.ok(token);
  assert.equal((await client().post('/api/auth/verify-email', { token })).status, 200);
  assert.equal((await c.get('/api/auth/me')).json.user.emailVerified, true);
  assert.equal((await client().post('/api/auth/verify-email', { token })).status, 400, 'a link works once');
});

test('password reset: same answer for unknown emails, link works once, signs everyone out', async () => {
  const u = await makeUser('Resetter');
  const phone = await signIn(u);
  const known = await client().post('/api/auth/password-reset', { email: u.email });
  const unknown = await client().post('/api/auth/password-reset', { email: `ghost.${runTag}.x@kotka.test` });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.json, unknown.json, 'no hint whether the account exists');
  const mail = await mailFor(u.email, (m) => m.tag === 'password_reset');
  assert.equal(mailsTo(`ghost.${runTag}.x@kotka.test`).length, 0);
  const token = linkToken(mail, '/reset-password');
  assert.ok(token);

  assert.equal((await client().get(`/api/auth/password-reset/check?token=${token}`)).json.valid, true);
  // A weak password is refused without using up the link.
  assert.equal((await client().post('/api/auth/password-reset/confirm', { token, password: 'password123' })).status, 400);
  const ok = await client().post('/api/auth/password-reset/confirm', { token, password: 'Brand-New-Passphrase-8' });
  assert.equal(ok.status, 200);
  assert.equal((await client().post('/api/auth/password-reset/confirm', { token, password: 'Another-Passphrase-9' })).status, 400, 'used once');
  assert.equal((await phone.get('/api/auth/me')).status, 401, 'existing sessions ended');
  assert.equal((await client().post('/api/auth/login', { email: u.email, password: PASSWORD })).status, 401, 'old password no longer works');
  assert.equal((await client().post('/api/auth/login', { email: u.email, password: 'Brand-New-Passphrase-8' })).status, 200);
  assert.ok(await mailFor(u.email, (m) => m.tag === 'security' && /password was changed/i.test(m.subject)), 'owner is told');
});

test('reset links expire, and forged tokens are refused', async () => {
  const u = await makeUser('Expired');
  await client().post('/api/auth/password-reset', { email: u.email });
  const token = linkToken(await mailFor(u.email, (m) => m.tag === 'password_reset'), '/reset-password');
  await prisma.emailToken.updateMany({ where: { userId: u.id, purpose: 'reset' }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await client().post('/api/auth/password-reset/confirm', { token, password: 'Fine-Passphrase-Here-1' })).status, 400);
  assert.equal((await client().post('/api/auth/password-reset/confirm', { token: 'A'.repeat(43), password: 'Fine-Passphrase-Here-1' })).status, 400);
  assert.equal((await client().post('/api/auth/password-reset/confirm', { token: { $ne: null }, password: 'Fine-Passphrase-Here-1' })).status, 400);
});

test('reset emails are rate-limited per address', async () => {
  const u = await makeUser('Spammed');
  const results = [];
  for (let i = 0; i < 4; i++) results.push((await client().post('/api/auth/password-reset', { email: u.email })).status);
  assert.deepEqual(results, [200, 200, 200, 429]);
});

test('a sign-in from a new device triggers an alert; the same device does not', async () => {
  const u = await makeUser('Traveller');
  const base = await startServer();
  const login = (ua) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': ua }, body: JSON.stringify({ email: u.email, password: PASSWORD }) });
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';
  const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36';
  await login(mac);
  await login(mac);
  await wait();
  assert.equal(mailsTo(u.email).filter((m) => /New sign-in/.test(m.subject)).length, 0);
  await login(android);
  await mailFor(u.email, (m) => /New sign-in/.test(m.subject));
  const alerts = mailsTo(u.email).filter((m) => /New sign-in/.test(m.subject));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].text, /Chrome on Android/);
});

test('newsletter is opt-in and the choice is saved', async () => {
  const u = await makeUser('Reader');
  const c = await signIn(u);
  assert.equal((await c.get('/api/auth/me')).json.user.newsletter, false);
  const r = await c.put('/api/account/newsletter', { optIn: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.newsletter, true);
  assert.equal((await c.put('/api/account/newsletter', { optIn: 'yes please' })).status, 400);
});
