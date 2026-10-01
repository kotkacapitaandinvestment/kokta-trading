// Real-time delivery for Community, built on the existing stack (Express on
// Vercel + Postgres), with no extra service:
//
// - publish() appends rows to RealtimeEvent.
// - Each server instance with open streams tails that table once a second
//   and pushes matching events to its browsers over Server-Sent Events.
// - Streams last ~4 minutes (inside the serverless time limit); the browser's
//   EventSource reconnects with Last-Event-ID and missed events are replayed,
//   so nothing is lost between connections.
//
// Channels: user:<id> (private: DMs, groups, notifications), conv:<id>
// (public rooms and event rooms), market:<SYMBOL> (sentiment, activity).
// One database query per second per instance, regardless of how many
// people are connected to it.

import { prisma } from './prisma.js';

const POLL_MS = 1000;
const STREAM_MS = 240 * 1000;
const HEARTBEAT_MS = 20 * 1000;
const PRESENCE_MS = 60 * 1000;
// How often an open stream re-checks that its session is still valid, so a
// signed-out, suspended or banned account stops receiving within seconds.
const RECHECK_MS = 20 * 1000;
const RETAIN_HOURS = 6;

const subscribers = new Set();
let cursor = null; // BigInt: last event id this instance has dispatched
let timer = null;
let initializing = null;

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

async function ensureCursor() {
  if (cursor !== null) return;
  if (!initializing) {
    initializing = prisma.$queryRaw`SELECT COALESCE(MAX(id), 0) AS id FROM "RealtimeEvent"`.then((rows) => {
      cursor = BigInt(rows[0].id);
      initializing = null;
    });
  }
  await initializing;
}

function dispatch(row) {
  for (const sub of subscribers) {
    if (!sub.channels.has(row.channel)) continue;
    if (sub.pending) sub.pending.push(row);
    else sub.deliver(row);
  }
}

function schedule(ms) {
  timer = setTimeout(tick, ms);
}

async function tick() {
  if (!subscribers.size) {
    timer = null;
    cursor = null; // re-read the head next time; old events are replayed per subscriber
    return;
  }
  try {
    await ensureCursor();
    const rows = await prisma.$queryRaw`SELECT id, channel, type, payload FROM "RealtimeEvent" WHERE id > ${cursor} ORDER BY id ASC LIMIT 500`;
    for (const row of rows) {
      cursor = row.id;
      dispatch(row);
    }
    if (rows.length === 500) return schedule(0);
  } catch (err) {
    console.error('Realtime poll failed:', err.message);
  }
  schedule(POLL_MS);
}

async function subscribe(sub, lastId) {
  await ensureCursor();
  const upto = cursor;
  sub.pending = [];
  subscribers.add(sub);
  if (!timer) schedule(POLL_MS);
  if (lastId !== null && lastId < upto) {
    const channels = [...sub.channels];
    const rows = await prisma.$queryRaw`
      SELECT id, channel, type, payload FROM "RealtimeEvent"
      WHERE id > ${lastId} AND id <= ${upto} AND channel = ANY(${channels})
      ORDER BY id ASC LIMIT 1000`;
    for (const row of rows) sub.deliver(row);
  }
  const pending = sub.pending;
  sub.pending = null;
  for (const row of pending) sub.deliver(row);
}

function parseLastId(req) {
  const raw = req.get('last-event-id') ?? req.query.lastEventId;
  if (!raw || !/^\d{1,20}$/.test(String(raw))) return null;
  return BigInt(raw);
}

// Opens an SSE stream for already-authorised channels.
export async function openStream(req, res, { channels, onPresence, stillAllowed }) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write('retry: 1500\n\n');

  let lastSent = parseLastId(req) ?? -1n;
  const sub = {
    channels: new Set(channels),
    pending: null,
    deliver(row) {
      if (row.id <= lastSent) return;
      lastSent = row.id;
      res.write(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify({ channel: row.channel, ...row.payload })}\n\n`);
    },
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    subscribers.delete(sub);
    clearInterval(heartbeat);
    clearInterval(presence);
    clearInterval(recheck);
    clearTimeout(lifetime);
  };
  // The browser reconnects on 'ended' only to be refused, and stops.
  const end = (event) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: {}\n\n`);
    close();
    res.end();
  };
  req.on('close', close);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  const presence = setInterval(() => onPresence?.().catch(() => {}), PRESENCE_MS);
  const recheck = setInterval(() => {
    stillAllowed?.().then((ok) => { if (!ok) end('ended'); }).catch(() => {});
  }, Number(process.env.KOTKA_RT_RECHECK_MS) || RECHECK_MS);
  const lifetime = setTimeout(() => end('reconnect'), STREAM_MS);

  onPresence?.().catch(() => {});
  try {
    await subscribe(sub, parseLastId(req));
    res.write(`event: ready\ndata: ${JSON.stringify({ channels })}\n\n`);
  } catch (err) {
    console.error('Realtime subscribe failed:', err.message);
    close();
    res.end();
  }
}

export function realtimeStats() {
  return { subscribers: subscribers.size, polling: !!timer };
}
