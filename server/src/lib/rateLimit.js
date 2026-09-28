// Rate limits.
//
// - hit(): sliding window in Postgres (RateLimitHit), shared by every
//   serverless instance. For actions that matter: writes, AI, account
//   changes. A burst of parallel requests can overshoot by a few, which is
//   fine for abuse limits (usage limits use a stricter lock, lib/usage/).
// - memoryLimit(): per-instance counters for cheap, high-volume checks
//   (every authenticated request, public pages). Weaker on serverless, but
//   free, and backed by Vercel's and Cloudflare's own flood protection.

import { prisma } from './prisma.js';
import { clientIp } from './requestMeta.js';

const RETAIN_MS = 2 * 24 * 3600e3;

// [max hits, window ms] per action, per user unless noted.
export const LIMITS = {
  reaction: [150, 10 * 60e3],
  follow: [60, 3600e3],
  save: [150, 3600e3],
  journal: [60, 3600e3],
  checklist: [200, 3600e3],
  goalWrite: [60, 3600e3],
  checkin: [30, 3600e3],
  aiBurst: [8, 60e3],
  communityAi: [15, 10 * 60e3],
  passwordChange: [5, 3600e3],
  accountDelete: [5, 3600e3],
  mfa: [6, 15 * 60e3],
  mfaSetup: [10, 3600e3],
  kyc: [10, 3600e3],
  join: [30, 3600e3],
  push: [30, 3600e3],
  sessions: [30, 3600e3],
  profile: [30, 3600e3],
  conversationWrite: [120, 3600e3],
  emailSend: [5, 3600e3],
};

function prune() {
  if (Math.random() > 0.01) return;
  prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETAIN_MS) } } }).catch(() => {});
}

// Records a hit for `key` unless it is already at `max` in the window.
// Returns true when over the limit (the hit is then not recorded).
export async function hit(key, max, windowMs) {
  prune();
  const n = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  if (n >= max) return true;
  await prisma.rateLimitHit.create({ data: { key } });
  return false;
}

const TOO_FAST = 'You’re going a bit fast. Please wait a little and try again.';

// Express middleware: limit(name) keys on the signed-in user, or on the
// client IP for signed-out requests.
export function limit(name, { message = TOO_FAST, key } = {}) {
  const [max, windowMs] = LIMITS[name];
  return async (req, res, next) => {
    try {
      const who = key ? key(req) : req.userId ?? `ip:${clientIp(req) ?? 'unknown'}`;
      if (await hit(`${name}:${who}`, max, windowMs)) return res.status(429).json({ error: message, code: 'rate_limited' });
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Per-instance fixed-window counter. Returns true when over the limit.
const buckets = new Map();
export function memoryHit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { n: 0, resetAt: now + windowMs };
    buckets.set(key, b);
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  b.n += 1;
  return b.n > max;
}

export function memoryLimit(name, max, windowMs, keyFn = (req) => clientIp(req) ?? 'unknown') {
  return (req, res, next) => (memoryHit(`${name}:${keyFn(req)}`, max, windowMs) ? res.status(429).json({ error: TOO_FAST, code: 'rate_limited' }) : next());
}
