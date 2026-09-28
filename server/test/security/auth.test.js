// Authentication and sessions: generic errors, cookie flags, revocation,
// tampered tokens, password change, two-step verification.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, stopServer, makeUser, client, signIn, prisma, PASSWORD, runTag } from './helpers.js';
import { codeAt, currentStep } from '../../src/lib/totp.js';

let alice;
before(async () => {
  await startServer();
  alice = await makeUser('Alice');
});
after(stopServer);

test('wrong password and unknown email get the same answer', async () => {
  const c = client();
  const a = await c.post('/api/auth/login', { email: alice.email, password: 'not-the-password' });
  const b = await c.post('/api/auth/login', { email: `nobody.${runTag}.x@kotka.test`, password: 'not-the-password' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.json.error, b.json.error);
});

test('session cookie is HttpOnly and SameSite=Lax', async () => {
  const c = client();
  const r = await fetch(`${(await startServer())}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: alice.email, password: PASSWORD }) });
  const set = r.headers.get('set-cookie') ?? '';
  assert.match(set, /kotka_session=/);
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  void c;
});

test('signing out revokes the session: the old cookie stops working', async () => {
  const c = await signIn(alice);
  const saved = c.cookie;
  assert.equal((await c.get('/api/auth/me')).status, 200);
  await c.post('/api/auth/logout');
  const replay = client();
  replay.cookie = saved;
  assert.equal((await replay.get('/api/auth/me')).status, 401);
});

test('tampered, unsigned and foreign-signed tokens are refused', async () => {
  const forged = client();
  forged.cookie = `kotka_session=${jwt.sign({ sub: alice.id }, 'not-the-server-secret')}`;
  assert.equal((await forged.get('/api/auth/me')).status, 401);

  const none = client();
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: alice.id })).toString('base64url');
  none.cookie = `kotka_session=${header}.${body}.`;
  assert.equal((await none.get('/api/auth/me')).status, 401);

  const c = await signIn(alice);
  const [h, p, s] = c.cookie.replace('kotka_session=', '').split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  const swapped = client();
  swapped.cookie = `kotka_session=${h}.${Buffer.from(JSON.stringify({ ...payload, sub: 'someone-else' })).toString('base64url')}.${s}`;
  assert.equal((await swapped.get('/api/auth/me')).status, 401);
});

test('changing the password signs out other browsers but keeps this one', async () => {
  const bob = await makeUser('Bob');
  const phone = await signIn(bob);
  const laptop = await signIn(bob);
  const r = await laptop.post('/api/account/password', { currentPassword: PASSWORD, newPassword: 'Another-Long-Passphrase-7' });
  assert.equal(r.status, 200);
  assert.ok(r.json.signedOut >= 1);
  assert.equal((await phone.get('/api/auth/me')).status, 401);
  assert.equal((await laptop.get('/api/auth/me')).status, 200);
});

test('weak passwords are refused', async () => {
  const c = client();
  const r = await c.post('/api/auth/signup', { name: 'Weak Pw', email: `weak.${runTag}.pw@kotka.test`, password: 'password123' });
  assert.equal(r.status, 400);
});

test('a client cannot choose its own role at sign-up', async () => {
  const c = client();
  const email = `role.${runTag}.pick@kotka.test`;
  const r = await c.post('/api/auth/signup', { name: 'Role Picker', email, password: 'A-Decent-Passphrase-42', role: 'super_admin', plan: 'Premium' });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.role, 'trader');
  await prisma.user.deleteMany({ where: { email } });
});

test('cookies from before revocable sessions still work once, then follow the new rules', async () => {
  const carol = await makeUser('Carol');
  const legacy = client();
  legacy.cookie = `kotka_session=${jwt.sign({ sub: carol.id }, process.env.JWT_SECRET, { expiresIn: '7d' })}`;
  const first = await legacy.get('/api/auth/me');
  assert.equal(first.status, 200);
  const upgraded = JSON.parse(Buffer.from(legacy.cookie.split('.')[1], 'base64url'));
  assert.ok(upgraded.sid, 'upgraded to a revocable session cookie');
  // "Sign out everywhere" from another browser invalidates old-style cookies too.
  const other = await signIn(carol);
  await other.post('/api/account/sessions/revoke-others');
  const stale = client();
  stale.cookie = `kotka_session=${jwt.sign({ sub: carol.id, iat: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, { expiresIn: '7d' })}`;
  assert.equal((await stale.get('/api/auth/me')).status, 401);
});

test('two-step verification: code required, codes cannot be replayed, recovery codes work once', async () => {
  const dave = await makeUser('Dave');
  const c = await signIn(dave);
  assert.equal((await c.post('/api/account/mfa/setup', { password: 'wrong' })).status, 400);
  const setup = await c.post('/api/account/mfa/setup', { password: PASSWORD });
  assert.equal(setup.status, 200);
  const secret = setup.json.secret;
  const enable = await c.post('/api/account/mfa/enable', { code: codeAt(secret, currentStep()) });
  assert.equal(enable.status, 200);
  const [recovery] = enable.json.recoveryCodes;

  // Password alone no longer signs in.
  const login = client();
  const step1 = await login.post('/api/auth/login', { email: dave.email, password: PASSWORD });
  assert.equal(step1.status, 200);
  assert.equal(step1.json.mfaRequired, true);
  assert.equal(login.cookie, '', 'no session before the second step');

  // The challenge token is not a session cookie.
  const sneaky = client();
  sneaky.cookie = `kotka_session=${step1.json.challenge}`;
  assert.equal((await sneaky.get('/api/auth/me')).status, 401);

  assert.equal((await login.post('/api/auth/login/mfa', { challenge: step1.json.challenge, code: '000000' })).status, 401);
  const next = codeAt(secret, currentStep() + 1);
  assert.equal((await login.post('/api/auth/login/mfa', { challenge: step1.json.challenge, code: next })).status, 200);
  // Same code again: refused.
  const again = client();
  const s2 = await again.post('/api/auth/login', { email: dave.email, password: PASSWORD });
  assert.equal((await again.post('/api/auth/login/mfa', { challenge: s2.json.challenge, code: next })).status, 401);
  // Recovery code: once.
  assert.equal((await again.post('/api/auth/login/mfa', { challenge: s2.json.challenge, code: recovery })).status, 200);
  const third = client();
  const s3 = await third.post('/api/auth/login', { email: dave.email, password: PASSWORD });
  assert.equal((await third.post('/api/auth/login/mfa', { challenge: s3.json.challenge, code: recovery })).status, 401);
});

test('suspending an account ends its sessions', async () => {
  const eve = await makeUser('Eve');
  const admin = await makeUser('AdminA', { role: 'admin' });
  const eveC = await signIn(eve);
  const adminC = await signIn(admin);
  assert.equal((await adminC.patch(`/api/admin/users/${eve.id}`, { status: 'suspended' })).status, 200);
  const r = await eveC.get('/api/auth/me');
  assert.ok([401, 403].includes(r.status));
  const rows = await prisma.session.count({ where: { userId: eve.id, revokedAt: null } });
  assert.equal(rows, 0);
});
