import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { INSTRUMENTS, instrument, instrumentView } from '../../lib/instruments.js';
import { userCard, USER_CARD_SELECT, relationsFor } from '../../lib/community/users.js';
import { postViews, newsView, eventView, POST_INCLUDE } from '../../lib/community/posts.js';
import { excerpt } from '../../lib/community/serialize.js';

export const searchRouter = Router();

const TYPE_ALIASES = { message: 'messages', messages: 'messages', post: 'posts', posts: 'posts', idea: 'ideas', ideas: 'ideas', 'trade-idea': 'ideas', 'trade-ideas': 'ideas', news: 'news', event: 'events', events: 'events', user: 'users', users: 'users', people: 'users', market: 'markets', markets: 'markets', room: 'rooms', rooms: 'rooms', communities: 'rooms', community: 'rooms' };

// "EURUSD author:david type:trade-idea date:last-7-days" -> structured query.
export function parseQuery(raw) {
  const out = { text: [], author: null, type: null, since: null, market: null };
  for (const tok of String(raw ?? '').trim().split(/\s+/).filter(Boolean)) {
    const [k, ...rest] = tok.split(':');
    const v = rest.join(':').toLowerCase();
    if (rest.length && k === 'author') out.author = v.replace(/^@/, '');
    else if (rest.length && k === 'type' && TYPE_ALIASES[v]) out.type = TYPE_ALIASES[v];
    else if (rest.length && (k === 'market' || k === 'in') && instrument(v)) out.market = instrument(v).symbol;
    else if (rest.length && k === 'date') {
      const days = v === 'today' ? 1 : v === 'week' || v === 'last-week' ? 7 : v === 'month' || v === 'last-month' ? 30 : Number(v.match(/^last-(\d{1,3})-days?$/)?.[1]) || null;
      if (days) out.since = new Date(Date.now() - days * 86400e3);
    } else if (/^\$[a-z0-9]{3,8}$/i.test(tok) && instrument(tok.slice(1))) out.market = instrument(tok.slice(1)).symbol;
    else if (!rest.length && instrument(tok) && tok.length >= 6) out.market = instrument(tok).symbol;
    else out.text.push(tok);
  }
  out.text = out.text.join(' ').slice(0, 100);
  return out;
}

searchRouter.get('/search', asyncHandler(async (req, res) => {
  const q = parseQuery(req.query.q);
  const only = q.type ?? (TYPE_ALIASES[req.query.type] || null);
  const want = (t) => !only || only === t;
  const text = q.text;
  const hasText = text.length >= 2;
  if (!hasText && !q.market && !q.author) return res.json({ query: q, results: {} });

  const rel = await relationsFor(req.me.id);
  let authorId = null;
  if (q.author) {
    const a = await prisma.user.findFirst({ where: { OR: [{ username: q.author }, { name: { contains: q.author, mode: 'insensitive' } }] }, select: { id: true } });
    if (!a) return res.json({ query: q, results: {} });
    authorId = a.id;
  }
  const dateWhere = q.since ? { gte: q.since } : undefined;
  const results = {};
  const tasks = [];

  if (want('users') && hasText && !q.market) {
    tasks.push(
      prisma.user.findMany({ where: { status: 'active', username: { not: null }, OR: [{ username: { contains: text.toLowerCase().replace(/^@/, '') } }, { name: { contains: text, mode: 'insensitive' } }, { headline: { contains: text, mode: 'insensitive' } }] }, select: USER_CARD_SELECT, take: 8 })
        .then((u) => (results.users = u.map((x) => userCard(x, { showOnline: false })))),
    );
  }
  if (want('markets')) {
    const t = text.toLowerCase();
    const markets = INSTRUMENTS.filter((i) => (q.market && i.symbol === q.market) || (hasText && (i.symbol.toLowerCase().includes(t.replace('/', '')) || i.name.toLowerCase().includes(t) || i.display.toLowerCase().includes(t))));
    results.markets = markets.slice(0, 8).map(instrumentView);
  }
  if (want('rooms') && hasText) {
    tasks.push(
      prisma.conversation.findMany({ where: { kind: 'community', visibility: { in: ['public', 'private'] }, archivedAt: null, OR: [{ name: { contains: text, mode: 'insensitive' } }, { description: { contains: text, mode: 'insensitive' } }] }, take: 8, select: { id: true, name: true, description: true, visibility: true } })
        .then((r) => (results.rooms = r)),
    );
  }
  const postWhere = (kind) => ({
    deletedAt: null,
    removedAt: null,
    ...(kind === 'idea' ? { kind: 'idea' } : { kind: { not: 'idea' } }),
    ...(rel.hidden.size ? { authorId: { notIn: [...rel.hidden] } } : {}),
    ...(authorId ? { authorId } : {}),
    ...(q.market ? { instrument: q.market } : {}),
    ...(dateWhere ? { createdAt: dateWhere } : {}),
    ...(hasText ? (kind === 'idea' ? { OR: [{ body: { contains: text, mode: 'insensitive' } }, { idea: { thesis: { contains: text, mode: 'insensitive' } } }] } : { body: { contains: text, mode: 'insensitive' } }) : {}),
  });
  if (want('posts')) tasks.push(prisma.post.findMany({ where: postWhere('post'), orderBy: { createdAt: 'desc' }, take: 10, include: POST_INCLUDE }).then(async (p) => (results.posts = await postViews(p, req.me.id))));
  if (want('ideas')) tasks.push(prisma.post.findMany({ where: postWhere('idea'), orderBy: { createdAt: 'desc' }, take: 10, include: POST_INCLUDE }).then(async (p) => (results.ideas = await postViews(p, req.me.id))));
  if (want('messages') && (hasText || authorId)) {
    tasks.push(
      prisma.message
        .findMany({
          where: {
            deletedAt: null,
            removedById: null,
            ...(hasText ? { body: { contains: text, mode: 'insensitive' } } : {}),
            ...(authorId ? { authorId } : {}),
            ...(rel.hidden.size ? { authorId: { notIn: [...rel.hidden], ...(authorId ? { equals: authorId } : {}) } } : {}),
            ...(dateWhere ? { createdAt: dateWhere } : {}),
            conversation: {
              archivedAt: null,
              ...(q.market ? { instrument: q.market } : {}),
              OR: [{ kind: { in: ['room', 'event'] } }, { kind: 'community', visibility: 'public' }, { members: { some: { userId: req.me.id, status: 'active' } } }],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 15,
          include: { conversation: { select: { id: true, kind: true, name: true, instrument: true, eventId: true } }, author: { select: USER_CARD_SELECT } },
        })
        .then((m) => (results.messages = m.map((x) => ({ id: x.id, body: excerpt(x.body, 200), author: userCard(x.author, { showOnline: false }), createdAt: x.createdAt, threadRootId: x.threadRootId, conversation: x.conversation })))),
    );
  }
  if (want('news') && (hasText || q.market)) {
    tasks.push(
      prisma.newsItem.findMany({ where: { ...(hasText ? { headline: { contains: text, mode: 'insensitive' } } : {}), ...(q.market ? { instruments: { has: q.market } } : {}), ...(dateWhere ? { publishedAt: dateWhere } : {}) }, orderBy: { publishedAt: 'desc' }, take: 10 })
        .then((n) => (results.news = n.map(newsView))),
    );
  }
  if (want('events') && (hasText || q.market)) {
    const cur = q.market ? instrument(q.market).currencies : null;
    tasks.push(
      prisma.marketEvent.findMany({ where: { cancelled: false, ...(hasText ? { title: { contains: text, mode: 'insensitive' } } : {}), ...(cur ? { currency: { in: cur } } : {}), ...(dateWhere ? { scheduledAt: dateWhere } : {}) }, orderBy: { scheduledAt: 'desc' }, take: 10 })
        .then((e) => (results.events = e.map((x) => eventView(x)))),
    );
  }
  await Promise.all(tasks);
  for (const k of Object.keys(results)) if (!results[k]?.length) delete results[k];
  res.json({ query: { ...q, since: q.since }, results });
}));
