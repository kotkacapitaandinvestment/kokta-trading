// Persistent notifications with live delivery, preference checks and
// batching (repeats with the same groupKey fold into one unread row).

import { waitUntil } from '@vercel/functions';
import { prisma } from '../prisma.js';
import { publish } from '../realtime.js';
import { sendPush } from '../push.js';
import { prefsFor } from './users.js';

// type -> preference switch in communityPreferences.notify
const PREF = {
  message: 'messages',
  mention: 'mentions',
  reply: 'replies',
  follow: 'follows',
  reaction: 'activity',
  comment: 'activity',
  challenge: 'activity',
  poll: 'activity',
  idea: 'ideas',
  event: 'events',
  market: 'markets',
  news: 'news',
  moderation: null, // always delivered
  group: 'messages',
  achievement: 'achievements',
};

const URGENT = new Set(['message', 'group', 'mention', 'moderation']);

// items: [{ userId, type, actorId?, title, body?, link?, data?, groupKey? }]
export async function notify(items) {
  const list = items.filter((n) => n && n.userId && n.userId !== n.actorId);
  if (!list.length) return;
  const prefOf = await prefsFor([...new Set(list.map((n) => n.userId))]);
  const events = [];
  const pushes = [];
  for (const n of list) {
    const key = PREF[n.type];
    if (key && prefOf(n.userId).notify[key] === false) continue;
    if (!key || prefOf(n.userId).push[key] !== false) {
      pushes.push({ userId: n.userId, title: n.title, body: n.body, link: n.link, tag: n.groupKey ?? undefined, urgency: URGENT.has(n.type) ? 'high' : 'normal' });
    }
    let row = null;
    if (n.groupKey) {
      const existing = await prisma.notification.findFirst({ where: { userId: n.userId, groupKey: n.groupKey, readAt: null }, select: { id: true, count: true } });
      if (existing) {
        row = await prisma.notification.update({
          where: { id: existing.id },
          data: { count: existing.count + 1, title: n.title, body: n.body ?? null, actorId: n.actorId ?? null, link: n.link ?? null, data: n.data ?? {} },
        });
      }
    }
    if (!row) {
      row = await prisma.notification.create({
        data: { userId: n.userId, type: n.type, actorId: n.actorId ?? null, title: n.title, body: n.body ?? null, link: n.link ?? null, data: n.data ?? {}, groupKey: n.groupKey ?? null },
      });
    }
    events.push({ channel: `user:${n.userId}`, type: 'notification', payload: { notification: row } });
  }
  await publish(events);
  // Devices get the push after the response; the service worker skips it when
  // Kotka is open and in front.
  if (pushes.length) waitUntil(sendPush(pushes).catch((err) => console.warn('[push]', err.message)));
}

export async function unreadCount(userId) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
