// Shared setup for the security tests.
//
// SAFETY: these tests create and delete their own accounts and data. They
// refuse to run unless KOTKA_TEST_DB=1 and DATABASE_URL points at a test
// database (a Neon branch), never the production endpoint.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const PRODUCTION_HOSTS = ['ep-old-snow-axm62xcb'];
const url = process.env.DATABASE_URL ?? '';
if (process.env.KOTKA_TEST_DB !== '1' || !url || PRODUCTION_HOSTS.some((h) => url.includes(h))) {
  throw new Error('Security tests only run against a test database: set KOTKA_TEST_DB=1 and a non-production DATABASE_URL.');
}

const { prisma } = await import('../../src/lib/prisma.js');
const { app } = await import('../../src/app.js');
export { prisma };

const RUN = crypto.randomBytes(4).toString('hex');
const created = new Set();

let server;
let base;
export async function startServer() {
  if (server) return base;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

export async function stopServer() {
  // Remove everything these tests created (cascades to their content).
  const ids = [...created];
  if (ids.length) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } }).catch(() => {});
    await prisma.conversation.deleteMany({ where: { createdById: { in: ids } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  // Accounts made through the sign-up API in tests.
  await prisma.user.deleteMany({ where: { email: { contains: `.${RUN}.` } } }).catch(() => {});
  await prisma.authAttempt.deleteMany({ where: { email: { contains: `.${RUN}.` } } }).catch(() => {});
  await prisma.signupCode.deleteMany({ where: { email: { contains: `.${RUN}.` } } }).catch(() => {});
  await prisma.rateLimitHit.deleteMany({ where: { key: { contains: RUN } } }).catch(() => {});
  if (server) await new Promise((r) => server.close(r));
  await prisma.$disconnect();
}

export const PASSWORD = 'Correct-Horse-Battery-9';

// Creates a user directly in the test database. role: trader | moderator | admin | super_admin
export async function makeUser(name, { role = 'trader', username = true } = {}) {
  const tag = `${name.toLowerCase()}${RUN}`.slice(0, 20);
  const user = await prisma.user.create({
    data: {
      name: `Sec ${name}`,
      email: `sec.${RUN}.${name.toLowerCase()}@kotka.test`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      initials: name.slice(0, 2).toUpperCase(),
      role,
      username: username ? tag : null,
      settings: { create: {} },
      kyc: { create: { detailsCipher: 'x:y:z', country: 'NG', status: 'approved' } },
    },
  });
  created.add(user.id);
  return user;
}

// A tiny HTTP client that keeps its own session cookie (and its known-device
// cookie), like one browser.
export function client() {
  let cookie = '';
  let device = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie || device ? { Cookie: [cookie, device].filter(Boolean).join('; ') } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = /kotka_session=([^;]*)/.exec(set);
      if (m) cookie = m[1] ? `kotka_session=${m[1]}` : '';
      const d = /kotka_device=([^;]*)/.exec(set);
      if (d) device = d[1] ? `kotka_device=${d[1]}` : '';
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  };
  return {
    get: (p, h) => call('GET', p, undefined, h),
    post: (p, b = {}, h) => call('POST', p, b, h),
    put: (p, b = {}, h) => call('PUT', p, b, h),
    patch: (p, b = {}, h) => call('PATCH', p, b, h),
    delete: (p, b, h) => call('DELETE', p, b, h),
    get cookie() {
      return cookie;
    },
    set cookie(v) {
      cookie = v;
    },
    get device() {
      return device;
    },
    set device(v) {
      device = v;
    },
  };
}

export async function signIn(user) {
  const c = client();
  const r = await c.post('/api/auth/login', { email: user.email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`sign-in failed for ${user.email}: ${r.status} ${JSON.stringify(r.json)}`);
  return c;
}

export const runTag = RUN;
