// Brute-force and sign-up spam protection backed by the AuthAttempt table,
// so limits hold across serverless instances.

import { prisma } from './prisma.js';
import { clientIp } from './requestMeta.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_EMAIL = 8;
const LOGIN_MAX_PER_IP = 40;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_PER_IP = 10;
const RETAIN_MS = 2 * 24 * 60 * 60 * 1000;

function prune() {
  if (Math.random() > 0.02) return;
  prisma.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETAIN_MS) } } }).catch(() => {});
}

// Failed logins count per email since that email's last success (inside the
// window), and per IP across all emails.
// The check and the count happen together: under a lock on the email (and
// the network), the attempt is written down as a failure before the password
// is checked, so a burst of parallel guesses can't all see "under the limit".
// A right password then removes it (releaseLoginAttempt). Returns
// { blocked, id }.
export async function reserveLoginAttempt(req, email) {
  const ip = clientIp(req);
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  prune();
  return prisma.$transaction(async (tx) => {
    for (const k of [`kotka-login:${email}`, ...(ip ? [`kotka-login-ip:${ip}`] : [])].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${k}))`;
    const lastOk = await tx.authAttempt.findFirst({ where: { kind: 'login', email, success: true, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    const byEmail = await tx.authAttempt.count({ where: { kind: 'login', email, success: false, createdAt: { gte: lastOk?.createdAt ?? since } } });
    const byIp = ip ? await tx.authAttempt.count({ where: { kind: 'login', ip, success: false, createdAt: { gte: since } } }) : 0;
    if (byEmail >= LOGIN_MAX_PER_EMAIL || byIp >= LOGIN_MAX_PER_IP) return { blocked: true, id: null };
    const row = await tx.authAttempt.create({ data: { kind: 'login', email, ip, success: false }, select: { id: true } });
    return { blocked: false, id: row.id };
  }, { maxWait: 10000, timeout: 10000 });
}

export async function releaseLoginAttempt(id) {
  if (id) await prisma.authAttempt.delete({ where: { id } }).catch(() => {});
}

export async function signupBlocked(req) {
  const ip = clientIp(req);
  if (!ip) return false;
  const since = new Date(Date.now() - SIGNUP_WINDOW_MS);
  return (await prisma.authAttempt.count({ where: { kind: 'signup', ip, createdAt: { gte: since } } })) >= SIGNUP_MAX_PER_IP;
}

export async function recordAttempt(req, kind, email, success) {
  prune();
  await prisma.authAttempt
    .create({ data: { kind, email: email || null, ip: clientIp(req), success } })
    .catch((err) => console.error('AuthAttempt write failed:', err));
}
