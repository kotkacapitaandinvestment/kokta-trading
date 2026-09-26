import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { publish } from '../../lib/realtime.js';
import { INSTRUMENTS, MARKETS, instrument, instrumentView, marketStatus } from '../../lib/instruments.js';
import { instrumentMarketData } from '../../lib/marketPulse.js';
import { latestReportSummaries } from '../../lib/research/engine.js';
import { ensureMarketRoom } from '../../lib/community/rooms.js';
import { sentimentFor, sentimentHistory, snapshotSentiment, SENTIMENT_WINDOW_DAYS } from '../../lib/community/sentiment.js';
import { eventView } from '../../lib/community/posts.js';
import { requireProfile } from './context.js';

export const marketsRouter = Router();
const HOUR = 3600e3;

async function roomActivity(symbols, sinceMs = 24 * HOUR) {
  const since = new Date(Date.now() - sinceMs);
  const rows = await prisma.$queryRaw`
    SELECT c.instrument, COUNT(m.id)::int AS messages, COUNT(DISTINCT m."authorId")::int AS participants, MAX(m."createdAt") AS "lastAt"
    FROM "Conversation" c JOIN "Message" m ON m."conversationId" = c.id
    WHERE c.kind = 'room' AND c.instrument = ANY(${symbols}) AND m."createdAt" >= ${since} AND m."deletedAt" IS NULL
    GROUP BY c.instrument`;
  return new Map(rows.map((r) => [r.instrument, r]));
}

marketsRouter.get('/markets', asyncHandler(async (req, res) => {
  const symbols = INSTRUMENTS.map((i) => i.symbol);
  const [activity, sentiment, follows, data] = await Promise.all([
    roomActivity(symbols),
    sentimentFor(symbols),
    prisma.follow.findMany({ where: { followerId: req.me.id, targetType: 'market' }, select: { targetId: true } }),
    Promise.all(symbols.map((s) => instrumentMarketData(s, { fetch: false }))),
  ]);
  const followed = new Set(follows.map((f) => f.targetId));
  res.json({
    groups: MARKETS,
    markets: INSTRUMENTS.map((i, idx) => {
      const d = data[idx];
      const a = activity.get(i.symbol);
      return {
        ...instrumentView(i),
        data: d?.available ? { close: d.close, closeDate: d.closeDate, changePct: d.changePct, regime: d.regime, closes: d.closes, stale: d.stale } : { available: false, reason: d?.reason ?? 'not_loaded', note: d?.note ?? null },
        status: marketStatus(i),
        activity: { messages24h: a?.messages ?? 0, participants24h: a?.participants ?? 0, lastAt: a?.lastAt ?? null },
        sentiment: sentiment.get(i.symbol),
        followed: followed.has(i.symbol),
      };
    }),
  });
}));

marketsRouter.get('/markets/:symbol', asyncHandler(async (req, res) => {
  const inst = instrument(req.params.symbol);
  if (!inst) return res.status(404).json({ error: 'Unknown market.' });
  const room = await ensureMarketRoom(inst.symbol);
  const now = new Date();
  const [data, sentiment, history, myVote, activity, research, events, openIdeas, followers, following] = await Promise.all([
    instrumentMarketData(inst.symbol, { fetch: true }),
    sentimentFor(inst.symbol),
    sentimentHistory(inst.symbol),
    prisma.sentimentVote.findUnique({ where: { instrument_userId: { instrument: inst.symbol, userId: req.me.id } } }),
    roomActivity([inst.symbol]),
    inst.research ? latestReportSummaries().then((m) => m.get(`pair:${inst.research}`) ?? null) : null,
    prisma.marketEvent.findMany({ where: { cancelled: false, currency: { in: inst.currencies }, scheduledAt: { gte: new Date(now.getTime() - 2 * HOUR), lte: new Date(now.getTime() + 14 * 86400e3) } }, orderBy: { scheduledAt: 'asc' }, take: 8 }),
    prisma.post.count({ where: { kind: 'idea', instrument: inst.symbol, deletedAt: null, removedAt: null, idea: { status: { in: ['open', 'updated'] } } } }),
    prisma.follow.count({ where: { targetType: 'market', targetId: inst.symbol } }),
    prisma.follow.findUnique({ where: { followerId_targetType_targetId: { followerId: req.me.id, targetType: 'market', targetId: inst.symbol } } }),
  ]);
  const a = activity.get(inst.symbol);
  res.json({
    instrument: instrumentView(inst),
    room: { id: room.id, messages24h: a?.messages ?? 0, participants24h: a?.participants ?? 0, lastAt: a?.lastAt ?? null },
    data,
    status: marketStatus(inst, now),
    fundamental: research
      ? { subject: inst.research, score: research.score, confidence: research.confidence, condition: research.condition, direction: research.direction, updatedAt: research.createdAt }
      : { available: false, reason: inst.research ? 'Kotka has not researched this pair yet.' : 'Fundamental Research covers currency pairs only.' },
    sentiment: { ...sentiment, windowDays: SENTIMENT_WINDOW_DAYS, mine: myVote && myVote.updatedAt > new Date(now.getTime() - SENTIMENT_WINDOW_DAYS * 86400e3) ? myVote.stance : null, history },
    events: events.map((e) => eventView(e, now)),
    counts: { openIdeas, followers },
    following: !!following,
  });
}));

marketsRouter.post('/markets/:symbol/sentiment', requireProfile, asyncHandler(async (req, res) => {
  const inst = instrument(req.params.symbol);
  if (!inst) return res.status(404).json({ error: 'Unknown market.' });
  const stance = req.body?.stance;
  if (stance === null) {
    await prisma.sentimentVote.deleteMany({ where: { instrument: inst.symbol, userId: req.me.id } });
  } else {
    if (!['bullish', 'neutral', 'bearish'].includes(stance)) return res.status(400).json({ error: 'Choose bullish, neutral or bearish.' });
    await prisma.sentimentVote.upsert({ where: { instrument_userId: { instrument: inst.symbol, userId: req.me.id } }, update: { stance }, create: { instrument: inst.symbol, userId: req.me.id, stance } });
  }
  await snapshotSentiment(inst.symbol);
  const sentiment = await sentimentFor(inst.symbol);
  await publish({ channel: `market:${inst.symbol}`, type: 'sentiment', payload: { symbol: inst.symbol, sentiment } });
  res.json({ sentiment: { ...sentiment, windowDays: SENTIMENT_WINDOW_DAYS, mine: stance ?? null, history: await sentimentHistory(inst.symbol) } });
}));

// Charts: images traders shared about this market, and the real price history.
marketsRouter.get('/markets/:symbol/charts', asyncHandler(async (req, res) => {
  const inst = instrument(req.params.symbol);
  if (!inst) return res.status(404).json({ error: 'Unknown market.' });
  const room = await ensureMarketRoom(inst.symbol);
  const [posts, messages, data] = await Promise.all([
    prisma.post.findMany({ where: { instrument: inst.symbol, deletedAt: null, removedAt: null }, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, kind: true, authorId: true, attachments: true, createdAt: true, body: true } }),
    prisma.message.findMany({ where: { conversationId: room.id, deletedAt: null, removedById: null }, orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, authorId: true, attachments: true, createdAt: true, body: true } }),
    instrumentMarketData(inst.symbol, { fetch: false }),
  ]);
  const { userCards } = await import('../../lib/community/users.js');
  const shots = [
    ...posts.flatMap((p) => (p.attachments ?? []).filter((x) => x.type === 'image').map((x) => ({ url: x.url, width: x.width, height: x.height, source: 'post', sourceId: p.id, postKind: p.kind, authorId: p.authorId, caption: p.body?.slice(0, 140), createdAt: p.createdAt }))),
    ...messages.flatMap((m) => (m.attachments ?? []).filter((x) => x.type === 'image').map((x) => ({ url: x.url, width: x.width, height: x.height, source: 'message', sourceId: m.id, authorId: m.authorId, caption: m.body?.slice(0, 140), createdAt: m.createdAt }))),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 60);
  const cards = await userCards(shots.map((s) => s.authorId));
  res.json({ shots: shots.map((s) => ({ ...s, author: cards.get(s.authorId) ?? null })), price: data?.available ? { history: data.history, closeDate: data.closeDate, decimals: inst.decimals } : null });
}));
