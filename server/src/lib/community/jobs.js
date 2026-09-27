// Hourly Community jobs, run from the existing scheduled call
// (/api/research/cron via cron-job.org).
import { prisma } from '../prisma.js';
import { INSTRUMENTS, instrument } from '../instruments.js';
import { instrumentMarketData } from '../marketPulse.js';
import { ensureFreshNews } from './news.js';
import { ensureEventsSynced } from './events.js';
import { snapshotAllSentiment } from './sentiment.js';
import { notify } from './notify.js';

const HOUR = 3600e3;

async function alreadyNotified(groupKey) {
  const rows = await prisma.notification.findMany({ where: { groupKey }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

async function marketFollowers(symbols) {
  const rows = await prisma.follow.findMany({ where: { targetType: 'market', targetId: { in: symbols } }, select: { followerId: true, targetId: true } });
  return rows;
}

// Reminders for events starting in the next ~75 minutes: people following
// the event, and (for high-importance events) people following its markets.
async function eventReminders() {
  const now = Date.now();
  const events = await prisma.marketEvent.findMany({ where: { cancelled: false, dateOnly: false, scheduledAt: { gte: new Date(now), lte: new Date(now + 75 * 60 * 1000) } } });
  let sent = 0;
  for (const e of events) {
    const key = `event:${e.id}`;
    const done = await alreadyNotified(key);
    const ids = new Set((await prisma.follow.findMany({ where: { targetType: 'event', targetId: e.id }, select: { followerId: true } })).map((f) => f.followerId));
    if (e.importance === 'High') for (const f of await marketFollowers(e.instruments)) ids.add(f.followerId);
    const mins = Math.max(1, Math.round((new Date(e.scheduledAt).getTime() - now) / 60000));
    const items = [...ids].filter((id) => !done.has(id)).map((userId) => ({ userId, type: 'event', title: `${e.title} in ${mins} minutes`, body: `${e.currency} · ${e.importance} importance. The event room is open.`, link: `/app/community/events/${e.id}`, groupKey: key }));
    await notify(items);
    sent += items.length;
  }
  return sent;
}

// A followed market closed with a move larger than its 14-day ATR.
async function marketMoveAlerts() {
  let sent = 0;
  for (const inst of INSTRUMENTS) {
    const d = await instrumentMarketData(inst.symbol, { fetch: false });
    if (!d?.available || !d.unusualMove || d.stale) continue;
    const key = `move:${inst.symbol}:${d.closeDate}`;
    const done = await alreadyNotified(key);
    const followers = (await marketFollowers([inst.symbol])).map((f) => f.followerId).filter((id) => !done.has(id));
    await notify(followers.map((userId) => ({ userId, type: 'market', title: `${inst.display} closed ${d.changePct > 0 ? '+' : ''}${d.changePct}% on ${d.closeDate}`, body: `Larger than its 14-day average range (${d.atrPct}%).`, link: `/app/community/markets/${inst.symbol}`, groupKey: key })));
    sent += followers.length;
  }
  return sent;
}

// Official central-bank releases -> followers of the affected markets.
async function officialNewsAlerts() {
  const fresh = await prisma.newsItem.findMany({ where: { official: true, createdAt: { gte: new Date(Date.now() - 2 * HOUR) } } });
  let sent = 0;
  for (const n of fresh) {
    const key = `news:${n.id}`;
    const done = await alreadyNotified(key);
    const ids = [...new Set((await marketFollowers(n.instruments)).map((f) => f.followerId))].filter((id) => !done.has(id));
    await notify(ids.map((userId) => ({ userId, type: 'news', title: `${n.provider}: ${n.headline}`.slice(0, 200), link: `/app/community/news/${n.id}`, groupKey: key })));
    sent += ids.length;
  }
  return sent;
}

export async function runCommunityJobs() {
  const out = {};
  const step = async (name, fn) => {
    try {
      out[name] = await fn();
    } catch (err) {
      out[name] = `failed: ${err.message}`;
      console.error(`Community job ${name} failed:`, err);
    }
  };
  await step('news', ensureFreshNews);
  await step('events', ensureEventsSynced);
  await step('sentiment', snapshotAllSentiment);
  await step('eventReminders', eventReminders);
  await step('marketMoves', marketMoveAlerts);
  await step('officialNews', officialNewsAlerts);
  await step('goals', async () => (await import('../goals/social.js')).runGoalJobs());
  await step('prune', async () => (await prisma.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 6 * HOUR) } } })).count);
  return out;
}
