// Real-time delivery for Community, built on the existing stack (Express on
// Vercel + Postgres), with no extra service:
//
// - publish() appends rows to RealtimeEvent.
// - Each open tab checks in every few seconds (eventsSince): one quick query
//   for its channels after the last event it saw, answered at once. Hidden
//   tabs don't check in at all (push notifications cover them).
//
// It used to be a Server-Sent Events stream held open for 4 minutes at a
// time. On serverless hosting that kept a function running for every open
// tab, all day, and used up Vercel's free allowance (paused 2026-10-13).
// Short check-ins cost a fraction of a second each.
//
// Channels: user:<id> (private: DMs, groups, notifications), conv:<id>
// (public rooms and event rooms), market:<SYMBOL> (sentiment, activity).

import { prisma } from './prisma.js';

const RETAIN_HOURS = 6;
const BATCH = 200;

export async function publish(events) {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (!list.length) return;
  await prisma.realtimeEvent
    .createMany({ data: list.map((e) => ({ channel: e.channel, type: e.type, payload: e.payload ?? {} })) })
    .catch((err) => console.error('Realtime publish failed:', err.message));
  if (Math.random() < 0.01) {
    prisma.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETAIN_HOURS * 3600 * 1000) } } }).catch(() => {});
  }
}

// Fan an event out to several users' private channels (DMs, groups).
export function toUsers(userIds, type, payload) {
  return [...new Set(userIds)].map((id) => ({ channel: `user:${id}`, type, payload }));
}

export function parseCursor(raw) {
  return raw !== undefined && /^\d{1,20}$/.test(String(raw)) ? BigInt(raw) : null;
}

/**
 * Events on `channels` after `after` (a cursor from an earlier answer).
 * With no cursor, nothing is replayed: the answer just says where "now" is.
 * Returns { cursor, events: [{ id, type, data }], more }.
 */
export async function eventsSince(channels, after) {
  const [{ head }] = await prisma.$queryRaw`SELECT COALESCE(MAX(id), 0) AS head FROM "RealtimeEvent"`;
  const top = BigInt(head);
  if (after === null || after >= top) return { cursor: String(top), events: [], more: false };
  const rows = await prisma.$queryRaw`
    SELECT id, channel, type, payload FROM "RealtimeEvent"
    WHERE id > ${after} AND id <= ${top} AND channel = ANY(${channels})
    ORDER BY id ASC LIMIT ${BATCH}::int`;
  const more = rows.length === BATCH;
  return {
    cursor: String(more ? rows.at(-1).id : top),
    events: rows.map((r) => ({ id: String(r.id), type: r.type, data: { channel: r.channel, ...r.payload } })),
    more,
  };
}
