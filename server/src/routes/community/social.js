import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { auditLater } from '../../lib/audit.js';
import { instrument } from '../../lib/instruments.js';
import { notify } from '../../lib/community/notify.js';
import { userCards } from '../../lib/community/users.js';
import { requireProfile } from './context.js';

export const socialRouter = Router();

export const TOPICS = ['macro', 'technical', 'price-action', 'risk', 'psychology', 'education', 'central-banks', 'inflation', 'employment', 'geopolitics', 'crypto', 'commodities'];
const FOLLOW_TYPES = ['user', 'market', 'topic', 'idea', 'event'];
const SAVE_TYPES = ['post', 'idea', 'news', 'message', 'event', 'conversation'];

async function validTarget(type, id, me) {
  switch (type) {
    case 'user': {
      if (id === me.id) return { error: "You can't follow yourself." };
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
      return u && u.status === 'active' ? { id } : { error: 'We couldn’t find that trader. Their account may have been closed.' };
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

socialRouter.post('/follow', requireProfile, asyncHandler(async (req, res) => {
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

socialRouter.post('/saved', requireProfile, asyncHandler(async (req, res) => {
  const itemType = String(req.body?.itemType ?? '');
  const itemId = String(req.body?.itemId ?? '');
  if (!SAVE_TYPES.includes(itemType) || !itemId) return res.status(400).json({ error: 'That can’t be saved.' });
  await prisma.savedItem.upsert({ where: { userId_itemType_itemId: { userId: req.me.id, itemType, itemId } }, update: {}, create: { userId: req.me.id, itemType, itemId } });
  res.json({ saved: true });
}));

socialRouter.delete('/saved', asyncHandler(async (req, res) => {
  await prisma.savedItem.deleteMany({ where: { userId: req.me.id, itemType: String(req.body?.itemType ?? req.query.itemType ?? ''), itemId: String(req.body?.itemId ?? req.query.itemId ?? '') } });
  res.json({ saved: false });
}));

// Block / mute. Blocking also stops DMs both ways.
for (const kind of ['block', 'mute']) {
  socialRouter.post(`/users/:id/${kind}`, asyncHandler(async (req, res) => {
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
