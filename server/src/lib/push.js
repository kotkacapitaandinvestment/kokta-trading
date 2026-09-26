// Web Push: delivers notifications to a user's devices even when Kotka is
// closed. VAPID keys are generated once and stored in the 'webpush'
// Integration row (private key encrypted). Subscriptions the push service
// reports as gone (404/410) are deleted.

import webpush from 'web-push';
import { prisma } from './prisma.js';
import { encryptSecret, decryptSecret } from './crypto.js';

const PROVIDER = 'webpush';
let keysPromise = null;

async function loadOrCreateKeys() {
  let row = await prisma.integration.findUnique({ where: { provider: PROVIDER } });
  if (!row?.publicKey || !row?.secretCipher) {
    const generated = webpush.generateVAPIDKeys();
    const subject = process.env.VAPID_SUBJECT || 'https://www.kotkafinance.online';
    try {
      // Only fills an empty row, so two instances racing keep one key pair.
      await prisma.integration.upsert({
        where: { provider: PROVIDER },
        update: {},
        create: { provider: PROVIDER, publicKey: generated.publicKey, secretCipher: encryptSecret(generated.privateKey), config: { subject } },
      });
    } catch {
      // Another instance created it first.
    }
    row = await prisma.integration.findUnique({ where: { provider: PROVIDER } });
  }
  return { publicKey: row.publicKey, privateKey: decryptSecret(row.secretCipher), subject: row.config?.subject || 'https://www.kotkafinance.online' };
}

export function vapidKeys() {
  keysPromise ??= loadOrCreateKeys().catch((err) => {
    keysPromise = null;
    throw err;
  });
  return keysPromise;
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

// Payload the service worker shows. Kept small: push services cap it at 4KB.
function payload(n) {
  return JSON.stringify({
    title: String(n.title ?? 'Kotka').slice(0, 120),
    body: String(n.body ?? '').slice(0, 240),
    link: n.link || '/app/notifications',
    tag: n.tag || undefined,
    at: new Date().toISOString(),
    skipIfFocused: n.skipIfFocused !== false,
  });
}

async function deliver(sub, body, { urgency = 'normal', ttl = 24 * 3600 } = {}, keys) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
      { TTL: ttl, urgency, vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, timeout: 10000 },
    );
    return { ok: true, id: sub.id };
  } catch (err) {
    const gone = err.statusCode === 404 || err.statusCode === 410;
    return { ok: false, id: sub.id, gone, status: err.statusCode ?? null, error: String(err.body || err.message).slice(0, 160) };
  }
}

// items: [{ userId, title, body?, link?, tag?, urgency?, ttl? }]
export async function sendPush(items) {
  const list = items.filter((i) => i?.userId);
  if (!list.length) return { sent: 0, failed: 0, removed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: [...new Set(list.map((i) => i.userId))] } } });
  if (!subs.length) return { sent: 0, failed: 0, removed: 0 };
  const keys = await vapidKeys();
  const byUser = new Map();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

  const jobs = [];
  for (const item of list) {
    const body = payload(item);
    for (const sub of byUser.get(item.userId) ?? []) jobs.push(deliver(sub, body, item, keys));
  }
  const results = await Promise.all(jobs);
  const gone = results.filter((r) => r.gone).map((r) => r.id);
  const ok = [...new Set(results.filter((r) => r.ok).map((r) => r.id))];
  await Promise.all([
    gone.length ? prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } }) : null,
    ok.length ? prisma.pushSubscription.updateMany({ where: { id: { in: ok } }, data: { lastUsedAt: new Date() } }) : null,
  ]);
  const failures = results.filter((r) => !r.ok && !r.gone);
  if (failures.length) console.warn('[push] delivery failures', failures.slice(0, 3));
  return { sent: ok.length, failed: failures.length, removed: gone.length, results };
}
