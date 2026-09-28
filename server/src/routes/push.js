import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLater } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { vapidPublicKey, sendPush } from '../lib/push.js';
import { limit } from '../lib/rateLimit.js';

// Web Push subscriptions for the signed-in user's browsers and devices.
export const pushRouter = Router();
pushRouter.use(requireAuth);

const MAX_DEVICES = 10;

// Browsers' push services. The server POSTs to a subscription's endpoint, so
// only these hosts are accepted (no pushing to arbitrary or internal URLs).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

function parseSubscription(raw) {
  const endpoint = typeof raw?.endpoint === 'string' ? raw.endpoint : '';
  const p256dh = typeof raw?.keys?.p256dh === 'string' ? raw.keys.p256dh : '';
  const auth = typeof raw?.keys?.auth === 'string' ? raw.keys.auth : '';
  if (!/^https:\/\/[^\s]{10,2000}$/.test(endpoint) || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) return null;
  let host;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return null;
  }
  if (!PUSH_HOSTS.some((re) => re.test(host))) return null;
  return { endpoint, p256dh, auth };
}

function deviceName(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

pushRouter.get('/key', asyncHandler(async (req, res) => {
  res.json({ publicKey: await vapidPublicKey() });
}));

pushRouter.get('/devices', asyncHandler(async (req, res) => {
  const rows = await prisma.pushSubscription.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } });
  res.json({ devices: rows.map((r) => ({ id: r.id, endpoint: r.endpoint, name: deviceName(r.userAgent ?? ''), createdAt: r.createdAt, lastUsedAt: r.lastUsedAt })) });
}));

pushRouter.post('/subscribe', limit('push'), asyncHandler(async (req, res) => {
  const sub = parseSubscription(req.body?.subscription);
  if (!sub) return res.status(400).json({ error: 'That push subscription is not valid.' });
  const userAgent = String(req.get('user-agent') ?? '').slice(0, 300);
  if (typeof req.body?.replaces === 'string' && req.body.replaces !== sub.endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: req.body.replaces, userId: req.userId } });
  }
  // A browser belongs to whoever signed in last on it.
  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: req.userId, p256dh: sub.p256dh, auth: sub.auth, userAgent },
    create: { userId: req.userId, ...sub, userAgent },
  });
  const extra = await prisma.pushSubscription.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, skip: MAX_DEVICES, select: { id: true } });
  if (extra.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  auditLater(req, 'account.push_enabled', { targetType: 'device', targetId: row.id, detail: { device: deviceName(userAgent) } });
  res.status(201).json({ device: { id: row.id, name: deviceName(userAgent) } });
}));

pushRouter.post('/unsubscribe', asyncHandler(async (req, res) => {
  const where = typeof req.body?.endpoint === 'string' ? { endpoint: req.body.endpoint, userId: req.userId } : typeof req.body?.id === 'string' ? { id: req.body.id, userId: req.userId } : null;
  if (!where) return res.status(400).json({ error: 'Say which device to remove.' });
  const removed = await prisma.pushSubscription.deleteMany({ where });
  if (removed.count) auditLater(req, 'account.push_disabled', { targetType: 'device' });
  res.status(204).end();
}));

// Sends a real push to the user's own devices so they can check it arrives.
pushRouter.post('/test', limit('push'), asyncHandler(async (req, res) => {
  const count = await prisma.pushSubscription.count({ where: { userId: req.userId } });
  if (!count) return res.status(400).json({ error: 'Turn on push notifications on this device first.' });
  const result = await sendPush([{ userId: req.userId, title: 'Push notifications are on', body: 'This is how Kotka will reach you when the app is closed.', link: '/app/settings?section=notifications', tag: 'push-test', skipIfFocused: false }]);
  res.json({ sent: result.sent, failed: result.failed, removed: result.removed });
}));
