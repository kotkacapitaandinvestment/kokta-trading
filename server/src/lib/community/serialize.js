// Attachments and view models shared by messages, posts and comments.

import { prisma } from '../prisma.js';
import { ownedMedia, mediaUrl } from '../media.js';
import { instrument, instrumentView } from '../instruments.js';
import { instrumentMarketData } from '../marketPulse.js';
import { FLAG_LABELS } from './safety.js';

export const REACTIONS = ['👍', '❤️', '🔥', '😂', '🤔', '📈', '📉', '👏', '💪'];
const MAX_ATTACHMENTS = 6;
const MAX_IMAGES = 4;

// Market snapshot embedded when a market is attached: dated, from cache only.
export async function marketSnapshot(symbol) {
  const inst = instrument(symbol);
  if (!inst) return null;
  const d = await instrumentMarketData(inst.symbol, { fetch: false });
  if (!d?.available) return { symbol: inst.symbol, display: inst.display, available: false, reason: d?.reason ?? 'not_loaded' };
  return { symbol: inst.symbol, display: inst.display, available: true, close: d.close, changePct: d.changePct, closeDate: d.closeDate, regime: d.regime, decimals: inst.decimals };
}

// Validates client attachments. Returns { attachments } or { error }.
export async function normalizeAttachments(userId, input) {
  const list = Array.isArray(input) ? input.slice(0, MAX_ATTACHMENTS + 1) : [];
  if (list.length > MAX_ATTACHMENTS) return { error: `Up to ${MAX_ATTACHMENTS} attachments per message.` };
  const mediaIds = list.filter((a) => a && (a.type === 'image' || a.type === 'audio')).map((a) => String(a.mediaId ?? ''));
  if (list.filter((a) => a?.type === 'image').length > MAX_IMAGES) return { error: `Up to ${MAX_IMAGES} images at a time.` };
  const media = await ownedMedia(userId, mediaIds);
  const out = [];
  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    switch (a.type) {
      case 'image':
      case 'audio': {
        const m = media.get(String(a.mediaId ?? ''));
        if (!m || m.kind !== a.type) return { error: 'An attachment could not be found. Upload it again.' };
        out.push(a.type === 'image' ? { type: 'image', mediaId: m.id, url: mediaUrl(m), width: m.width, height: m.height } : { type: 'audio', mediaId: m.id, url: mediaUrl(m), durationMs: m.durationMs });
        break;
      }
      case 'market': {
        const snap = await marketSnapshot(a.symbol);
        if (!snap) return { error: 'We couldn’t find that market.' };
        out.push({ type: 'market', symbol: snap.symbol, snapshot: snap, attachedAt: new Date().toISOString() });
        break;
      }
      case 'post':
      case 'idea': {
        const post = await prisma.post.findUnique({ where: { id: String(a.postId ?? '') }, select: { id: true, deletedAt: true, removedAt: true } });
        if (!post || post.deletedAt || post.removedAt) return { error: 'That post is no longer available.' };
        out.push({ type: 'post', postId: post.id });
        break;
      }
      case 'news': {
        const n = await prisma.newsItem.findUnique({ where: { id: String(a.newsId ?? '') }, select: { id: true } });
        if (!n) return { error: 'That news item is no longer available.' };
        out.push({ type: 'news', newsId: n.id });
        break;
      }
      case 'event': {
        const e = await prisma.marketEvent.findUnique({ where: { id: String(a.eventId ?? '') }, select: { id: true } });
        if (!e) return { error: 'That event is no longer available.' };
        out.push({ type: 'event', eventId: e.id });
        break;
      }
      default:
        return { error: 'That kind of file can’t be attached.' };
    }
  }
  return { attachments: out };
}

const excerpt = (s, n = 180) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s ?? '');

export function ideaView(i) {
  if (!i) return null;
  return {
    instrument: i.instrument,
    display: instrument(i.instrument)?.display ?? i.instrument,
    direction: i.direction,
    timeframe: i.timeframe,
    entry: i.entry,
    stop: i.stop,
    target: i.target,
    riskReward: i.riskReward,
    thesis: i.thesis,
    status: i.status,
    statusNote: i.statusNote,
    statusChangedAt: i.statusChangedAt,
    history: i.history,
  };
}

export async function pollViews(pollIds, viewerId) {
  if (!pollIds.length) return new Map();
  const [polls, votes] = await Promise.all([
    prisma.poll.findMany({ where: { id: { in: pollIds } }, include: { options: { orderBy: { position: 'asc' } } } }),
    prisma.pollVote.findMany({ where: { pollId: { in: pollIds }, userId: viewerId }, select: { pollId: true, optionId: true } }),
  ]);
  const mine = new Map(votes.map((v) => [v.pollId, v.optionId]));
  return new Map(
    polls.map((p) => {
      const total = p.options.reduce((s, o) => s + o.voteCount, 0);
      return [p.id, { id: p.id, question: p.question, closesAt: p.closesAt, closed: !!p.closesAt && p.closesAt < new Date(), total, myVote: mine.get(p.id) ?? null, options: p.options.map((o) => ({ id: o.id, label: o.label, votes: o.voteCount })) }];
    }),
  );
}

// Batch-resolves referenced posts/news/events/polls for a set of attachment
// arrays. Returns a function mapping one stored array to display form.
export async function attachmentResolver(arrays, { viewerId, cards }) {
  const flat = arrays.flat().filter(Boolean);
  const postIds = [...new Set(flat.filter((a) => a.type === 'post').map((a) => a.postId))];
  const newsIds = [...new Set(flat.filter((a) => a.type === 'news').map((a) => a.newsId))];
  const eventIds = [...new Set(flat.filter((a) => a.type === 'event').map((a) => a.eventId))];
  const pollIds = [...new Set(flat.filter((a) => a.type === 'poll').map((a) => a.pollId))];
  const [posts, news, events, polls] = await Promise.all([
    postIds.length ? prisma.post.findMany({ where: { id: { in: postIds } }, include: { idea: true } }) : [],
    newsIds.length ? prisma.newsItem.findMany({ where: { id: { in: newsIds } }, select: { id: true, headline: true, provider: true, publishedAt: true, url: true, official: true } }) : [],
    eventIds.length ? prisma.marketEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, title: true, currency: true, scheduledAt: true, dateOnly: true, importance: true } }) : [],
    pollViews(pollIds, viewerId),
  ]);
  const authorCards = cards ?? new Map();
  const missingAuthors = posts.map((p) => p.authorId).filter((id) => !authorCards.has(id));
  if (missingAuthors.length) {
    const { userCards } = await import('./users.js');
    for (const [k, v] of await userCards(missingAuthors)) authorCards.set(k, v);
  }
  const P = new Map(posts.map((p) => [p.id, p]));
  const N = new Map(news.map((n) => [n.id, n]));
  const E = new Map(events.map((e) => [e.id, e]));
  return (arr) =>
    (Array.isArray(arr) ? arr : []).map((a) => {
      if (a.type === 'post') {
        const p = P.get(a.postId);
        if (!p || p.deletedAt || p.removedAt) return { type: 'post', postId: a.postId, unavailable: true };
        return { type: 'post', postId: p.id, kind: p.kind, author: authorCards.get(p.authorId) ?? null, excerpt: excerpt(p.body), instrument: p.instrument, idea: ideaView(p.idea), createdAt: p.createdAt };
      }
      if (a.type === 'news') return N.get(a.newsId) ? { type: 'news', ...N.get(a.newsId), newsId: a.newsId } : { type: 'news', newsId: a.newsId, unavailable: true };
      if (a.type === 'event') return E.get(a.eventId) ? { type: 'event', ...E.get(a.eventId), eventId: a.eventId } : { type: 'event', eventId: a.eventId, unavailable: true };
      if (a.type === 'poll') return polls.get(a.pollId) ? { type: 'poll', poll: polls.get(a.pollId) } : { type: 'poll', unavailable: true };
      return a;
    });
}

export function reactionSummary(reactions, viewerId) {
  const by = new Map();
  for (const r of reactions) {
    const e = by.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    e.count += 1;
    if (r.userId === viewerId) e.mine = true;
    by.set(r.emoji, e);
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

export const flagLabels = (flags) => (flags ?? []).map((f) => FLAG_LABELS[f]).filter(Boolean);

export function messageView(m, { cards, resolve, viewerId, hidden }) {
  const gone = !!m.deletedAt || !!m.removedById;
  return {
    id: m.id,
    conversationId: m.conversationId,
    author: m.authorId ? cards.get(m.authorId) ?? null : null,
    kind: m.kind,
    body: gone ? '' : m.body,
    deleted: !!m.deletedAt,
    removed: !!m.removedById,
    hiddenAuthor: !!(m.authorId && hidden?.has(m.authorId)),
    attachments: gone ? [] : resolve(m.attachments),
    mentions: m.mentions,
    warnings: gone ? [] : flagLabels(m.flags),
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          author: m.replyTo.authorId ? cards.get(m.replyTo.authorId) ?? null : null,
          body: m.replyTo.deletedAt || m.replyTo.removedById ? '' : excerpt(m.replyTo.body, 140),
          deleted: !!(m.replyTo.deletedAt || m.replyTo.removedById),
          hasAttachments: Array.isArray(m.replyTo.attachments) && m.replyTo.attachments.length > 0,
        }
      : null,
    threadRootId: m.threadRootId,
    threadCount: m.threadCount,
    lastThreadAt: m.lastThreadAt,
    editedAt: m.editedAt,
    pinnedAt: m.pinnedAt,
    createdAt: m.createdAt,
    reactions: reactionSummary(m.reactions ?? [], viewerId),
  };
}

export { instrumentView, excerpt };
