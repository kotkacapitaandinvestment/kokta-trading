import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { auditLater } from '../../lib/audit.js';
import { instrument } from '../../lib/instruments.js';
import { notify } from '../../lib/community/notify.js';
import { userCards } from '../../lib/community/users.js';
import { requireProfile } from './context.js';
import { conversationAccess } from '../../lib/community/access.js';
import { limit } from '../../lib/rateLimit.js';

export const socialRouter = Router();

export const TOPICS = ['macro', 'technical', 'price-action', 'risk', 'psychology', 'education', 'central-banks', 'inflation', 'employment', 'geopolitics', 'crypto', 'commodities'];
const FOLLOW_TYPES = ['user', 'market', 'topic', 'idea', 'event'];
const SAVE_TYPES = ['post', 'idea', 'news', 'message', 'event', 'conversation'];

async function validTarget(type, id, me) {
  switch (type) {
    case 'user': {
      if (id === me.id) return { error: "You can't follow yourself." };
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!u || u.status !== 'active') return { error: 'We couldn’t find that trader. Their account may have been closed.' };
      // A block, either way, rules out following.
      const blocked = await prisma.userRelation.findFirst({ where: { kind: 'block', OR: [{ userId: me.id, targetId: id }, { userId: id, targetId: me.id }] }, select: { userId: true } });
      return blocked ? { error: 'You can’t follow this trader.' } : { id };
    }
    case 'market':
      return instrument(id) ? { id: instrument(id).symbol } : { error: 'We couldn’t find that market.' };
    case 'topic':
      return TOPICS.includes(id) ? { id } : { error: 'We couldn’t find that topic.' };
    case 'idea': {
      const p = await prisma.post.findFirst({ where: { id, kind: 'idea', deletedAt: null, removedAt: null }, select: { id: true } });
      return p ? { id } : { error: 'We couldn’t find that trade idea. It may have been deleted.' };
    }
    case 'event': {
      const e = await prisma.marketEvent.findUnique({ where: { id }, select: { id: true } });
      return e ? { id } : { error: 'We couldn’t find that event. It may have been cancelled.' };
    }
    default:
      return { error: 'You can’t follow that.' };
  }
}

socialRouter.post('/follow', requireProfile, limit('follow'), asyncHandler(async (req, res) => {
  const type = String(req.body?.targetType ?? '');
  if (!FOLLOW_TYPES.includes(type)) return res.status(400).json({ error: 'You can’t follow that.' });
  const t = await validTarget(type, String(req.body?.targetId ?? ''), req.me);
  if (t.error) return res.status(400).json({ error: t.error });
  const existing = await prisma.follow.findUnique({ where: { followerId_targetType_targetId: { followerId: req.me.id, targetType: type, targetId: t.id } } });
  if (!existing) {
    await prisma.follow.create({ data: { followerId: req.me.id, targetType: type, targetId: t.id } });
    if (type === 'user') {
      await notify([{ userId: t.id, type: 'follow', actorId: req.me.id, title: `${req.me.name} (@${req.me.username}) followed you`, link: `/app/community/u/${req.me.username}`, groupKey: 'follows' }]);
    }
  }
  res.json({ following: true });
}));

socialRouter.delete('/follow', asyncHandler(async (req, res) => {
  const type = String(req.body?.targetType ?? req.query.targetType ?? '');
  const raw = String(req.body?.targetId ?? req.query.targetId ?? '');
  const id = type === 'market' ? instrument(raw)?.symbol ?? raw : raw;
  await prisma.follow.deleteMany({ where: { followerId: req.me.id, targetType: type, targetId: id } });
  res.json({ following: false });
}));

// Everything the viewer follows, grouped.
socialRouter.get('/following', asyncHandler(async (req, res) => {
  const rows = await prisma.follow.findMany({ where: { followerId: req.me.id }, orderBy: { createdAt: 'desc' } });
  const by = (t) => rows.filter((r) => r.targetType === t).map((r) => r.targetId);
  const cards = await userCards(by('user'));
  const [ideas, events] = await Promise.all([
    prisma.post.findMany({ where: { id: { in: by('idea') } }, include: { idea: true } }),
    prisma.marketEvent.findMany({ where: { id: { in: by('event') } } }),
  ]);
  res.json({
    users: by('user').map((id) => cards.get(id)).filter(Boolean),
    markets: by('market'),
    topics: by('topic'),
    ideas: ideas.map((p) => ({ postId: p.id, instrument: p.idea?.instrument, direction: p.idea?.direction, status: p.idea?.status })),
    events: events.map((e) => ({ id: e.id, title: e.title, scheduledAt: e.scheduledAt, currency: e.currency })),
    topicCatalog: TOPICS,
  });
}));

// Only items the viewer can see right now can be saved (object-level check:
// a message id from someone else's private chat must never be saveable).
async function canSave(itemType, itemId, me) {
  switch (itemType) {
    case 'post':
    case 'idea':
      return !!(await prisma.post.findFirst({ where: { id: itemId, deletedAt: null, removedAt: null }, select: { id: true } }));
    case 'news':
      return !!(await prisma.newsItem.findUnique({ where: { id: itemId }, select: { id: true } }));
    case 'event':
      return !!(await prisma.marketEvent.findUnique({ where: { id: itemId }, select: { id: true } }));
    case 'message': {
      const m = await prisma.message.findUnique({ where: { id: itemId }, select: { deletedAt: true, removedById: true, conversation: true } });
      return !!m && !m.deletedAt && !m.removedById && (await conversationAccess(m.conversation, me)).canRead;
    }
    case 'conversation':
      return (await conversationAccess(itemId, me)).canRead;
    default:
      return false;
  }
}

socialRouter.post('/saved', requireProfile, limit('save'), asyncHandler(async (req, res) => {
  const itemType = String(req.body?.itemType ?? '');
  const itemId = String(req.body?.itemId ?? '').slice(0, 64);
  if (!SAVE_TYPES.includes(itemType) || !itemId) return res.status(400).json({ error: 'That can’t be saved.' });
  if (!(await canSave(itemType, itemId, req.me))) return res.status(404).json({ error: 'We couldn’t find that. It may have been removed.' });
  await prisma.savedItem.upsert({ where: { userId_itemType_itemId: { userId: req.me.id, itemType, itemId } }, update: {}, create: { userId: req.me.id, itemType, itemId } });
  res.json({ saved: true });
}));

socialRouter.delete('/saved', asyncHandler(async (req, res) => {
  await prisma.savedItem.deleteMany({ where: { userId: req.me.id, itemType: String(req.body?.itemType ?? req.query.itemType ?? ''), itemId: String(req.body?.itemId ?? req.query.itemId ?? '') } });
  res.json({ saved: false });
}));

// Block / mute. Blocking also stops DMs both ways.
for (const kind of ['block', 'mute']) {
  socialRouter.post(`/users/:id/${kind}`, limit('follow'), asyncHandler(async (req, res) => {
    if (req.params.id === req.me.id) return res.status(400).json({ error: `You can't ${kind} yourself.` });
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'We couldn’t find that trader. Their account may have been closed.' });
    await prisma.userRelation.upsert({ where: { userId_targetId_kind: { userId: req.me.id, targetId: target.id, kind } }, update: {}, create: { userId: req.me.id, targetId: target.id, kind } });
    if (kind === 'block') await prisma.follow.deleteMany({ where: { OR: [{ followerId: req.me.id, targetType: 'user', targetId: target.id }, { followerId: target.id, targetType: 'user', targetId: req.me.id }] } });
    auditLater(req, `community.${kind === 'block' ? 'blocked' : 'muted'}_user`, { targetType: 'user', targetId: req.params.id, actor: req.me });
    res.json({ [kind === 'block' ? 'blocked' : 'muted']: true });
  }));
  socialRouter.delete(`/users/:id/${kind}`, asyncHandler(async (req, res) => {
    await prisma.userRelation.deleteMany({ where: { userId: req.me.id, targetId: req.params.id, kind } });
    res.json({ [kind === 'block' ? 'blocked' : 'muted']: false });
  }));
}

socialRouter.get('/relations', asyncHandler(async (req, res) => {
  const rows = await prisma.userRelation.findMany({ where: { userId: req.me.id }, orderBy: { createdAt: 'desc' } });
  const cards = await userCards(rows.map((r) => r.targetId));
  res.json({
    blocked: rows.filter((r) => r.kind === 'block').map((r) => cards.get(r.targetId)).filter(Boolean),
    muted: rows.filter((r) => r.kind === 'mute').map((r) => cards.get(r.targetId)).filter(Boolean),
  });
}));
