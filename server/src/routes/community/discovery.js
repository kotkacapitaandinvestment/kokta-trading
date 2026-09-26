import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { INSTRUMENTS, instrument } from '../../lib/instruments.js';
import { instrumentMarketData } from '../../lib/marketPulse.js';
import { ensureFreshNews } from '../../lib/community/news.js';
import { ensureEventsSynced, eventReaction } from '../../lib/community/events.js';
import { ensureEventRoom } from '../../lib/community/rooms.js';
import { newsView, eventView, postViews, POST_INCLUDE } from '../../lib/community/posts.js';
import { userCards } from '../../lib/community/users.js';
import { clampInt } from './context.js';

export const discoveryRouter = Router();
const HOUR = 3600e3;

// ── news ───────────────────────────────────────────────────────────────────
discoveryRouter.get('/news', asyncHandler(async (req, res) => {
  await ensureFreshNews().catch((err) => console.error('News refresh failed:', err.message));
  const inst = instrument(req.query.instrument);
  const where = {
    ...(inst ? { OR: [{ instruments: { has: inst.symbol } }, { currencies: { hasSome: inst.currencies }, topics: { isEmpty: false } }] } : {}),
    ...(typeof req.query.currency === 'string' ? { currencies: { has: req.query.currency.toUpperCase() } } : {}),
    ...(req.query.official === '1' ? { official: true } : {}),
    ...(typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? { publishedAt: { lt: new Date(req.query.before) } } : {}),
  };
  const limit = clampInt(req.query.limit, 5, 50, 25);
  const rows = await prisma.newsItem.findMany({ where, orderBy: { publishedAt: 'desc' }, take: limit });
  res.json({ news: rows.map(newsView), next: rows.length === limit ? { before: rows[rows.length - 1].publishedAt } : null });
}));

discoveryRouter.get('/news/:id', asyncHandler(async (req, res) => {
  const n = await prisma.newsItem.findUnique({ where: { id: req.params.id } });
  if (!n) return res.status(404).json({ error: 'News item not found.' });
  const [saved, takes] = await Promise.all([
    prisma.savedItem.findUnique({ where: { userId_itemType_itemId: { userId: req.me.id, itemType: 'news', itemId: n.id } } }),
    prisma.post.findMany({ where: { newsId: n.id, deletedAt: null, removedAt: null }, orderBy: { createdAt: 'desc' }, take: 20, include: POST_INCLUDE }),
  ]);
  res.json({
    news: { ...newsView(n), explanation: n.explanation, explanationModel: n.explanationModel, explainedAt: n.explainedAt, relatedMarkets: n.instruments.map((s) => instrument(s)).filter(Boolean).map((i) => ({ symbol: i.symbol, display: i.display })) },
    saved: !!saved,
    posts: await postViews(takes, req.me.id),
  });
}));

// ── events ─────────────────────────────────────────────────────────────────
discoveryRouter.get('/events', asyncHandler(async (req, res) => {
  await ensureEventsSynced().catch((err) => console.error('Event sync failed:', err.message));
  const range = req.query.range === 'past' ? 'past' : 'upcoming';
  const now = new Date();
  const inst = instrument(req.query.instrument);
  const where = {
    cancelled: false,
    ...(range === 'upcoming' ? { scheduledAt: { gte: new Date(now.getTime() - 3 * HOUR) } } : { scheduledAt: { lt: now } }),
    ...(inst ? { currency: { in: inst.currencies } } : {}),
    ...(typeof req.query.currency === 'string' ? { currency: req.query.currency.toUpperCase() } : {}),
    ...(req.query.importance === 'High' ? { importance: 'High' } : {}),
  };
  const rows = await prisma.marketEvent.findMany({ where, orderBy: { scheduledAt: range === 'upcoming' ? 'asc' : 'desc' }, take: clampInt(req.query.limit, 5, 100, 50) });
  const [rooms, follows] = await Promise.all([
    prisma.conversation.findMany({ where: { eventId: { in: rows.map((r) => r.id) } }, select: { id: true, eventId: true, messageCount: true } }),
    prisma.follow.findMany({ where: { followerId: req.me.id, targetType: 'event', targetId: { in: rows.map((r) => r.id) } }, select: { targetId: true } }),
  ]);
  const roomBy = new Map(rooms.map((r) => [r.eventId, r]));
  const followSet = new Set(follows.map((f) => f.targetId));
  res.json({
    events: rows.map((e) => ({ ...eventView(e, now), messages: roomBy.get(e.id)?.messageCount ?? 0, following: followSet.has(e.id) })),
    coverage: 'Official calendars: Federal Reserve, BLS and BEA (USD); ECB and Eurostat (EUR). Other economies are not covered yet.',
  });
}));

discoveryRouter.get('/events/:id', asyncHandler(async (req, res) => {
  const e = await prisma.marketEvent.findUnique({ where: { id: req.params.id } });
  if (!e) return res.status(404).json({ error: 'Event not found.' });
  const room = await ensureEventRoom(e);
  const [reaction, following, followers, participants] = await Promise.all([
    eventReaction(e),
    prisma.follow.findUnique({ where: { followerId_targetType_targetId: { followerId: req.me.id, targetType: 'event', targetId: e.id } } }),
    prisma.follow.count({ where: { targetType: 'event', targetId: e.id } }),
    prisma.message.groupBy({ by: ['authorId'], where: { conversationId: room.id, deletedAt: null, authorId: { not: null } } }).then((r) => r.length),
  ]);
  res.json({ event: { ...eventView(e), summary: e.summary, summaryAt: e.summaryAt }, room: { id: room.id, messageCount: room.messageCount, participants }, reaction, following: !!following, followers });
}));

// ── trending & live ────────────────────────────────────────────────────────
// Ranked on real activity only: discussion volume, distinct participants,
// the latest daily move relative to normal volatility, and event importance.
discoveryRouter.get('/trending', asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 24 * HOUR);
  const symbols = INSTRUMENTS.map((i) => i.symbol);
  const [msgs, posts, events] = await Promise.all([
    prisma.$queryRaw`
      SELECT c.instrument, COUNT(m.id)::int AS n, COUNT(DISTINCT m."authorId")::int AS people
      FROM "Conversation" c JOIN "Message" m ON m."conversationId" = c.id
      WHERE c.kind = 'room' AND m."createdAt" >= ${since} AND m."deletedAt" IS NULL GROUP BY c.instrument`,
    prisma.$queryRaw`
      SELECT instrument, COUNT(*)::int AS n, COUNT(DISTINCT "authorId")::int AS people, COALESCE(SUM("commentCount"), 0)::int AS comments
      FROM "Post" WHERE instrument IS NOT NULL AND "createdAt" >= ${since} AND "deletedAt" IS NULL AND "removedAt" IS NULL GROUP BY instrument`,
    prisma.marketEvent.findMany({ where: { cancelled: false, importance: 'High', scheduledAt: { gte: new Date(Date.now() - 6 * HOUR), lte: new Date(Date.now() + 24 * HOUR) } }, select: { currency: true } }),
  ]);
  const m = new Map(msgs.map((r) => [r.instrument, r]));
  const p = new Map(posts.map((r) => [r.instrument, r]));
  const eventCur = new Set(events.map((e) => e.currency));
  const rows = [];
  for (const s of symbols) {
    const inst = instrument(s);
    const d = await instrumentMarketData(s, { fetch: false });
    const messages = m.get(s)?.n ?? 0;
    const postsN = p.get(s)?.n ?? 0;
    const people = (m.get(s)?.people ?? 0) + (p.get(s)?.people ?? 0);
    const moveRatio = d?.available && d.atrPct ? Math.abs(d.changePct) / d.atrPct : 0;
    const eventBoost = inst.currencies.some((c) => eventCur.has(c)) ? 1 : 0;
    const score = messages + 3 * postsN + 2 * (p.get(s)?.comments ?? 0) + 4 * people + 5 * moveRatio + 3 * eventBoost;
    if (messages + postsN === 0 && moveRatio < 1) continue;
    rows.push({ symbol: s, display: inst.display, messages24h: messages, posts24h: postsN, participants24h: people, changePct: d?.available ? d.changePct : null, unusualMove: d?.available ? d.unusualMove : false, eventToday: !!eventBoost, score: Math.round(score * 10) / 10 });
  }
  rows.sort((a, b) => b.score - a.score);
  const topics = await prisma.$queryRaw`
    SELECT t AS topic, COUNT(*)::int AS n FROM "Post", unnest(topics) AS t
    WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL AND "removedAt" IS NULL GROUP BY t ORDER BY n DESC LIMIT 6`;
  res.json({ markets: rows.slice(0, 8), topics, basis: 'Last 24 hours: messages, posts, comments, distinct participants, the latest daily move against normal volatility, and high-importance events.' });
}));

discoveryRouter.get('/live', asyncHandler(async (req, res) => {
  const now = Date.now();
  const since = new Date(now - 30 * 60 * 1000);
  const [rooms, events, news, hot] = await Promise.all([
    prisma.$queryRaw`
      SELECT c.id, c.kind, c.name, c.instrument, c."eventId", COUNT(m.id)::int AS messages, COUNT(DISTINCT m."authorId")::int AS people, MAX(m."createdAt") AS "lastAt"
      FROM "Conversation" c JOIN "Message" m ON m."conversationId" = c.id
      WHERE (c.kind IN ('room', 'event') OR (c.kind = 'community' AND c.visibility = 'public')) AND m."createdAt" >= ${since} AND m."deletedAt" IS NULL
      GROUP BY c.id ORDER BY people DESC, messages DESC LIMIT 8`,
    prisma.marketEvent.findMany({ where: { cancelled: false, scheduledAt: { gte: new Date(now - 2 * HOUR), lte: new Date(now + 20 * 60 * 1000) } }, orderBy: { scheduledAt: 'asc' }, take: 6 }),
    prisma.newsItem.findMany({ where: { publishedAt: { gte: new Date(now - HOUR) } }, orderBy: { publishedAt: 'desc' }, take: 5 }),
    prisma.post.findMany({ where: { deletedAt: null, removedAt: null, createdAt: { gte: new Date(now - 3 * HOUR) }, commentCount: { gte: 3 } }, orderBy: { commentCount: 'desc' }, take: 5, include: POST_INCLUDE }),
  ]);
  res.json({
    rooms: rooms.map((r) => ({ ...r, display: r.instrument ? instrument(r.instrument)?.display : r.name })),
    events: events.map((e) => eventView(e)),
    news: news.map(newsView),
    discussions: await postViews(hot, req.me.id),
    window: 'Rooms: last 30 minutes. News: last hour. Discussions: last 3 hours.',
  });
}));

// ── saved ──────────────────────────────────────────────────────────────────
discoveryRouter.get('/saved', asyncHandler(async (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : null;
  const rows = await prisma.savedItem.findMany({ where: { userId: req.me.id, ...(type ? { itemType: type } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  const ids = (t) => rows.filter((r) => r.itemType === t).map((r) => r.itemId);
  const [posts, news, events, messages] = await Promise.all([
    prisma.post.findMany({ where: { id: { in: [...ids('post'), ...ids('idea')] } }, include: POST_INCLUDE }),
    prisma.newsItem.findMany({ where: { id: { in: ids('news') } } }),
    prisma.marketEvent.findMany({ where: { id: { in: ids('event') } } }),
    prisma.message.findMany({ where: { id: { in: ids('message') }, deletedAt: null, removedById: null }, include: { conversation: { select: { id: true, kind: true, name: true, instrument: true, eventId: true } } } }),
  ]);
  const postV = new Map((await postViews(posts, req.me.id)).map((p) => [p.id, p]));
  const cards = await userCards(messages.map((m) => m.authorId));
  const newsBy = new Map(news.map((n) => [n.id, newsView(n)]));
  const eventBy = new Map(events.map((e) => [e.id, eventView(e)]));
  const msgBy = new Map(messages.map((m) => [m.id, { id: m.id, body: m.body, author: cards.get(m.authorId) ?? null, createdAt: m.createdAt, conversation: m.conversation }]));
  res.json({
    items: rows
      .map((r) => {
        const item = r.itemType === 'post' || r.itemType === 'idea' ? postV.get(r.itemId) : r.itemType === 'news' ? newsBy.get(r.itemId) : r.itemType === 'event' ? eventBy.get(r.itemId) : r.itemType === 'message' ? msgBy.get(r.itemId) : null;
        return item ? { type: r.itemType, savedAt: r.createdAt, item } : null;
      })
      .filter(Boolean),
  });
}));
