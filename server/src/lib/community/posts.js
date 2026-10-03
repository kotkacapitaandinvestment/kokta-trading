// Post view models and the Community feed.
//
// The feed is deliberately explainable: every item carries the reason it is
// shown ("You follow EUR/USD", "You follow @amara", "Trending").
// Ranking = relevance weight x recency decay, plus engagement for trending.

import { prisma } from '../prisma.js';
import { INSTRUMENTS, instrument } from '../instruments.js';
import { instrumentMarketData } from '../marketPulse.js';
import { userCards, relationsFor } from './users.js';
import { attachmentResolver, ideaView, pollViews, reactionSummary, flagLabels } from './serialize.js';

const HOUR = 3600 * 1000;
export const POST_INCLUDE = { idea: true, poll: { select: { id: true } }, reactions: { select: { emoji: true, userId: true } } };
const LIVE = { deletedAt: null, removedAt: null };

export async function postViews(posts, viewerId) {
  if (!posts.length) return [];
  const [cards, rel, saved, follows] = await Promise.all([
    userCards(posts.map((p) => p.authorId)),
    relationsFor(viewerId),
    prisma.savedItem.findMany({ where: { userId: viewerId, itemType: { in: ['post', 'idea'] }, itemId: { in: posts.map((p) => p.id) } }, select: { itemId: true } }),
    prisma.follow.findMany({ where: { followerId: viewerId, targetType: 'idea', targetId: { in: posts.filter((p) => p.kind === 'idea').map((p) => p.id) } }, select: { targetId: true } }),
  ]);
  const resolve = await attachmentResolver(posts.map((p) => p.attachments), { viewerId, cards });
  const polls = await pollViews(posts.map((p) => p.poll?.id).filter(Boolean), viewerId);
  const savedSet = new Set(saved.map((s) => s.itemId));
  const followSet = new Set(follows.map((f) => f.targetId));
  const news = posts.some((p) => p.newsId) ? await prisma.newsItem.findMany({ where: { id: { in: posts.map((p) => p.newsId).filter(Boolean) } }, select: { id: true, headline: true, provider: true, url: true, publishedAt: true, official: true } }) : [];
  const newsBy = new Map(news.map((n) => [n.id, n]));
  return posts.map((p) => {
    const gone = !!p.deletedAt || !!p.removedAt;
    const inst = instrument(p.instrument);
    return {
      id: p.id,
      kind: p.kind,
      author: cards.get(p.authorId) ?? null,
      mine: p.authorId === viewerId,
      hiddenAuthor: rel.hidden.has(p.authorId),
      body: gone ? '' : p.body,
      deleted: !!p.deletedAt,
      removed: !!p.removedAt,
      instrument: inst ? { symbol: inst.symbol, display: inst.display, market: inst.market } : null,
      topics: gone ? [] : p.topics,
      attachments: gone ? [] : resolve(p.attachments),
      idea: gone ? null : ideaView(p.idea),
      poll: !gone && p.poll ? polls.get(p.poll.id) ?? null : null,
      news: !gone && p.newsId ? newsBy.get(p.newsId) ?? null : null,
      warnings: gone ? [] : flagLabels(p.flags),
      commentCount: p.commentCount,
      reactionCount: p.reactionCount,
      reactions: reactionSummary(p.reactions ?? [], viewerId),
      saved: savedSet.has(p.id),
      followingIdea: followSet.has(p.id),
      featured: !!p.featuredAt,
      editedAt: p.editedAt,
      createdAt: p.createdAt,
    };
  });
}

export function newsView(n) {
  return { id: n.id, headline: n.headline, summary: n.summary, url: n.url, imageUrl: n.imageUrl, provider: n.provider === 'Finnhub' ? 'News wire' : n.provider, source: n.source, official: n.official, publishedAt: n.publishedAt, currencies: n.currencies, instruments: n.instruments, topics: n.topics, commentCount: n.commentCount, explained: !!n.explanation };
}

export function eventView(e, now = new Date()) {
  const t = new Date(e.scheduledAt).getTime();
  const phase = e.cancelled ? 'cancelled' : now.getTime() < t ? 'upcoming' : now.getTime() < t + 2 * HOUR ? 'live' : 'released';
  return {
    id: e.id,
    title: e.title,
    currency: e.currency,
    country: e.country,
    category: e.category,
    importance: e.importance,
    scheduledAt: e.scheduledAt,
    dateOnly: e.dateOnly,
    referencePeriod: e.referencePeriod,
    previous: e.previous,
    forecast: e.forecast,
    actual: e.actual,
    valuesNote: e.valuesNote,
    sourceName: e.sourceName,
    sourceUrl: e.sourceUrl,
    instruments: e.instruments,
    phase,
    hasSummary: !!e.summary,
  };
}

// Engagement score for trending: comments weigh more than reactions,
// distinct people more than volume, and it decays with age.
export function trendScore(p, uniqueCommenters = 0, now = Date.now()) {
  const ageH = (now - new Date(p.createdAt).getTime()) / HOUR;
  return (p.reactionCount + 2 * p.commentCount + 3 * uniqueCommenters) / Math.pow(ageH + 2, 1.3);
}

function recency(at, now, halfLifeH) {
  const ageH = Math.max(0, (now - new Date(at).getTime()) / HOUR);
  return Math.pow(0.5, ageH / halfLifeH);
}

const TYPE_FILTER = {
  all: null,
  posts: ['post', 'question', 'poll', 'market', 'news'],
  ideas: ['idea'],
  goals: ['achievement'],
};

async function followsOf(userId) {
  const rows = await prisma.follow.findMany({ where: { followerId: userId }, select: { targetType: true, targetId: true } });
  const pick = (t) => rows.filter((r) => r.targetType === t).map((r) => r.targetId);
  return { users: pick('user'), markets: pick('market'), topics: pick('topic') };
}

// Market moves from cached end-of-day bars (never fetches). One per
// instrument, for its latest close.
async function moveItems(symbols, { onlyUnusual }) {
  const out = [];
  for (const s of symbols) {
    const d = await instrumentMarketData(s, { fetch: false });
    if (!d?.available) continue;
    if (onlyUnusual && !d.unusualMove) continue;
    out.push({ symbol: s, display: d.display, close: d.close, changePct: d.changePct, closeDate: d.closeDate, atrPct: d.atrPct, unusual: d.unusualMove, decimals: d.decimals, at: new Date(`${d.closeDate}T22:00:00Z`) });
  }
  return out;
}

// Research score changes in the last 3 days, for "Kotka insight" items.
async function insightItems(subjects) {
  if (!subjects.length) return [];
  const since = new Date(Date.now() - 72 * HOUR);
  const recent = await prisma.researchReport.findMany({ where: { kind: 'pair', subject: { in: subjects }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { id: true, subject: true, score: true, condition: true, direction: true, createdAt: true } });
  const out = [];
  const seen = new Set();
  for (const r of recent) {
    if (seen.has(r.subject)) continue;
    seen.add(r.subject);
    const prev = await prisma.researchReport.findFirst({ where: { kind: 'pair', subject: r.subject, createdAt: { lt: r.createdAt } }, orderBy: { createdAt: 'desc' }, select: { score: true } });
    if (!prev || r.score == null || prev.score == null || Math.abs(r.score - prev.score) < 3) continue;
    out.push({ subject: r.subject, display: instrument(r.subject)?.display ?? r.subject, from: prev.score, to: r.score, condition: r.condition, direction: r.direction, at: r.createdAt });
  }
  return out;
}

export async function buildFeed(me, { mode = 'foryou', type = 'all', before = null, offset = 0, limit = 20 }) {
  const now = Date.now();
  const f = await followsOf(me.id);
  const rel = await relationsFor(me.id);
  const hidden = [...rel.hidden];
  const kinds = TYPE_FILTER[type] ?? null;
  const wantPosts = ['all', 'posts', 'ideas', 'markets', 'goals'].includes(type);
  const wantNews = ['all', 'news', 'markets'].includes(type) && mode !== 'following';
  const wantEvents = ['all', 'events', 'markets'].includes(type) && mode !== 'following';
  const wantMoves = ['all', 'markets'].includes(type) && mode !== 'following';
  const postWhere = { ...LIVE, ...(hidden.length ? { authorId: { notIn: hidden } } : {}), ...(kinds ? { kind: { in: kinds } } : {}), ...(type === 'markets' ? { instrument: { not: null } } : {}) };
  const items = [];

  if (mode === 'latest' || mode === 'following') {
    const where = { ...postWhere, ...(mode === 'following' ? { authorId: { in: f.users.filter((id) => !rel.hidden.has(id)) } } : {}), ...(before ? { createdAt: { lt: new Date(before) } } : {}) };
    const [posts, news] = await Promise.all([
      wantPosts ? prisma.post.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: POST_INCLUDE }) : [],
      wantNews && mode === 'latest' ? prisma.newsItem.findMany({ where: before ? { publishedAt: { lt: new Date(before) } } : {}, orderBy: { publishedAt: 'desc' }, take: Math.ceil(limit / 2) }) : [],
    ]);
    const views = await postViews(posts, me.id);
    for (const v of views) items.push({ key: `post:${v.id}`, type: 'post', at: v.createdAt, reason: mode === 'following' ? `You follow @${v.author?.username}` : null, post: v });
    for (const n of news) items.push({ key: `news:${n.id}`, type: 'news', at: n.publishedAt, reason: n.official ? 'Official release' : null, news: newsView(n) });
    items.sort((a, b) => new Date(b.at) - new Date(a.at));
    const page = items.slice(0, limit);
    return { items: page, next: page.length === limit ? { before: page[page.length - 1].at } : null };
  }

  // For You and Trending: score a candidate pool, then page by offset.
  const since = new Date(now - (mode === 'trending' ? 72 : 7 * 24) * HOUR);
  const followsSomething = f.users.length + f.markets.length + f.topics.length > 0;
  const followedCurrencies = [...new Set(f.markets.flatMap((s) => instrument(s)?.currencies ?? []))];
  const [pool, commenters] = await Promise.all([
    wantPosts ? prisma.post.findMany({ where: { ...postWhere, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 400, include: POST_INCLUDE }) : [],
    prisma.comment.groupBy({ by: ['targetId'], where: { targetType: 'post', createdAt: { gte: since }, deletedAt: null }, _count: { authorId: true } }),
  ]);
  const uniq = new Map(commenters.map((c) => [c.targetId, c._count.authorId]));
  const scored = [];
  for (const p of pool) {
    const trend = trendScore(p, uniq.get(p.id) ?? 0, now);
    if (mode === 'trending') {
      if (p.reactionCount + p.commentCount === 0) continue;
      scored.push({ p, score: trend, reason: 'Trending in Community' });
      continue;
    }
    let weight = 0;
    let reason = null;
    if (f.users.includes(p.authorId)) [weight, reason] = [3, 'from-followed'];
    else if (p.instrument && f.markets.includes(p.instrument)) [weight, reason] = [2.5, `You follow ${instrument(p.instrument)?.display ?? p.instrument}`];
    else if (p.topics.some((t) => f.topics.includes(t))) [weight, reason] = [2, `You follow #${p.topics.find((t) => f.topics.includes(t))}`];
    else if (trend > 0.15) [weight, reason] = [1.5, 'Trending in Community'];
    else if (!followsSomething || p.featuredAt) [weight, reason] = [p.featuredAt ? 2 : 1, p.featuredAt ? 'Featured by Kotka' : 'Recent in Community'];
    if (p.authorId === me.id) [weight, reason] = [Math.max(weight, 1), 'Your post'];
    if (!weight) continue;
    scored.push({ p, score: weight * recency(p.createdAt, now, 18) + trend, reason });
  }
  const views = new Map((await postViews(scored.map((s) => s.p), me.id)).map((v) => [v.id, v]));
  for (const s of scored) {
    const v = views.get(s.p.id);
    items.push({ key: `post:${v.id}`, type: 'post', at: v.createdAt, score: s.score, reason: s.reason === 'from-followed' ? `You follow @${v.author?.username}` : s.reason, post: v });
  }

  if (mode === 'foryou') {
    const newsWhere = { publishedAt: { gte: new Date(now - 48 * HOUR) }, ...(followedCurrencies.length ? { OR: [{ currencies: { hasSome: followedCurrencies } }, { instruments: { hasSome: f.markets } }, { official: true }] } : {}) };
    const [news, events, moves, insights] = await Promise.all([
      wantNews ? prisma.newsItem.findMany({ where: newsWhere, orderBy: { publishedAt: 'desc' }, take: 40 }) : [],
      wantEvents
        ? prisma.marketEvent.findMany({ where: { cancelled: false, scheduledAt: { gte: new Date(now - 2 * HOUR), lte: new Date(now + 24 * HOUR) }, ...(followedCurrencies.length ? { currency: { in: followedCurrencies } } : { importance: 'High' }) }, orderBy: { scheduledAt: 'asc' }, take: 8 })
        : [],
      wantMoves ? moveItems(f.markets.length ? f.markets : INSTRUMENTS.filter((i) => i.pulse).map((i) => i.symbol), { onlyUnusual: !f.markets.length }) : [],
      type === 'all' || type === 'markets' ? insightItems((f.markets.length ? f.markets : INSTRUMENTS.map((i) => i.research).filter(Boolean)).filter((s) => instrument(s)?.research)) : [],
    ]);
    for (const n of news) {
      const followedHit = n.instruments.find((s) => f.markets.includes(s));
      items.push({ key: `news:${n.id}`, type: 'news', at: n.publishedAt, score: (n.official ? 2.2 : followedHit ? 2 : 1) * recency(n.publishedAt, now, 10), reason: followedHit ? `News on ${instrument(followedHit)?.display}, which you follow` : n.official ? 'Official release' : 'Market news', news: newsView(n) });
    }
    for (const e of events) {
      const v = eventView(e, new Date(now));
      const soon = Math.max(0, (new Date(e.scheduledAt).getTime() - now) / HOUR);
      items.push({ key: `event:${e.id}`, type: 'event', at: e.scheduledAt, score: (v.phase === 'live' ? 4 : 2.5) * Math.pow(0.5, soon / 12), reason: v.phase === 'live' ? 'Happening now' : `Upcoming ${e.currency} release`, event: v });
    }
    for (const m of moves) {
      items.push({ key: `move:${m.symbol}:${m.closeDate}`, type: 'move', at: m.at, score: (m.unusual ? 2.5 : 1.2) * recency(m.at, now, 20), reason: f.markets.includes(m.symbol) ? `You follow ${m.display}` : 'Unusual move', move: m });
    }
    for (const i of insights) {
      items.push({ key: `insight:${i.subject}:${new Date(i.at).toISOString()}`, type: 'insight', at: i.at, score: 2.2 * recency(i.at, now, 24), reason: f.markets.includes(i.subject) ? `You follow ${i.display}` : 'Kotka research update', insight: i });
    }
  }

  items.sort((a, b) => b.score - a.score);
  const page = items.slice(offset, offset + limit);
  return { items: page, next: offset + limit < items.length ? { offset: offset + limit } : null };
}
