import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateUsername, impersonationError, suggestUsername, isStaff, loadPrefs, mergePrefs, userCard, relationsFor, USER_CARD_SELECT } from '../../lib/community/users.js';
import { unreadCount } from '../../lib/community/notify.js';
import { str } from './context.js';

export const profilesRouter = Router();

async function unreadMessages(userId) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "ConversationMember" cm
    JOIN "Conversation" c ON c.id = cm."conversationId"
    WHERE cm."userId" = ${userId} AND cm.status = 'active' AND cm."archivedAt" IS NULL
      AND c.kind IN ('dm', 'group') AND c."lastMessageAt" IS NOT NULL
      AND (cm."lastReadAt" IS NULL OR c."lastMessageAt" > cm."lastReadAt")
      AND (cm."mutedUntil" IS NULL OR cm."mutedUntil" < now())`;
  return rows[0]?.n ?? 0;
}

profilesRouter.get('/me', asyncHandler(async (req, res) => {
  const [prefs, notifications, messages] = await Promise.all([loadPrefs(req.me.id), unreadCount(req.me.id), unreadMessages(req.me.id)]);
  res.json({
    profile: { ...userCard({ ...req.me, lastSeenAt: new Date() }), bio: req.me.bio, email: req.me.email, mutedUntil: req.me.communityMutedUntil },
    needsProfile: !req.me.username,
    suggestedUsername: req.me.username ? null : await suggestUsername(req.me.name),
    prefs,
    unread: { notifications, messages },
  });
}));

profilesRouter.put('/me/profile', asyncHandler(async (req, res) => {
  const staff = isStaff(req.me);
  const data = {};
  if (req.body?.username !== undefined) {
    const { username, error } = validateUsername(req.body.username, { staff });
    if (error) return res.status(400).json({ error, field: 'username' });
    const taken = await prisma.user.findFirst({ where: { username, id: { not: req.me.id } }, select: { id: true } });
    if (taken) return res.status(409).json({ error: 'That username is taken.', field: 'username' });
    data.username = username;
  }
  if (req.body?.headline !== undefined) {
    const headline = str(req.body.headline, 80);
    const err = impersonationError(headline, { staff });
    if (err) return res.status(400).json({ error: err, field: 'headline' });
    data.headline = headline || null;
  }
  if (req.body?.bio !== undefined) {
    const bio = str(req.body.bio, 400);
    const err = impersonationError(bio, { staff });
    if (err) return res.status(400).json({ error: err, field: 'bio' });
    data.bio = bio || null;
  }
  if (req.body?.avatarMediaId !== undefined) {
    if (req.body.avatarMediaId === null) data.avatarId = null;
    else {
      const m = await prisma.media.findFirst({ where: { id: String(req.body.avatarMediaId), ownerId: req.me.id, kind: 'image' }, select: { id: true } });
      if (!m) return res.status(400).json({ error: 'Upload the photo again.', field: 'avatar' });
      data.avatarId = m.id;
    }
  }
  if (Array.isArray(req.body?.followMarkets)) {
    // First-run onboarding: follow a few markets in one go.
    const { instrument } = await import('../../lib/instruments.js');
    const symbols = [...new Set(req.body.followMarkets.map((s) => instrument(s)?.symbol).filter(Boolean))].slice(0, 20);
    for (const s of symbols) {
      await prisma.follow.upsert({ where: { followerId_targetType_targetId: { followerId: req.me.id, targetType: 'market', targetId: s } }, update: {}, create: { followerId: req.me.id, targetType: 'market', targetId: s } });
    }
  }
  const user = await prisma.user.update({ where: { id: req.me.id }, data, select: { ...USER_CARD_SELECT, bio: true } });
  res.json({ profile: { ...userCard(user), bio: user.bio } });
}));

profilesRouter.put('/me/preferences', asyncHandler(async (req, res) => {
  const current = await loadPrefs(req.me.id);
  const notify = { ...current.notify };
  for (const k of Object.keys(current.notify)) if (typeof req.body?.notify?.[k] === 'boolean') notify[k] = req.body.notify[k];
  const privacy = { ...current.privacy };
  for (const k of ['showOnline', 'readReceipts']) if (typeof req.body?.privacy?.[k] === 'boolean') privacy[k] = req.body.privacy[k];
  if (['everyone', 'following', 'nobody'].includes(req.body?.privacy?.allowDmsFrom)) privacy.allowDmsFrom = req.body.privacy.allowDmsFrom;
  const prefs = mergePrefs({ notify, privacy });
  await prisma.userSettings.upsert({ where: { userId: req.me.id }, update: { communityPreferences: prefs }, create: { userId: req.me.id, communityPreferences: prefs } });
  res.json({ prefs });
}));

// Public profile. Counts are plain counts, never a credibility score.
profilesRouter.get('/users/:username', asyncHandler(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { username: String(req.params.username).toLowerCase() }, select: { ...USER_CARD_SELECT, bio: true, createdAt: true } });
  if (!u || u.status === 'banned') return res.status(404).json({ error: 'Trader not found.' });
  const [prefs, followers, following, posts, ideas, markets, iFollow, rel, followsMe] = await Promise.all([
    loadPrefs(u.id),
    prisma.follow.count({ where: { targetType: 'user', targetId: u.id } }),
    prisma.follow.count({ where: { followerId: u.id, targetType: 'user' } }),
    prisma.post.count({ where: { authorId: u.id, deletedAt: null, removedAt: null, kind: { not: 'idea' } } }),
    prisma.post.count({ where: { authorId: u.id, deletedAt: null, removedAt: null, kind: 'idea' } }),
    prisma.follow.findMany({ where: { followerId: u.id, targetType: 'market' }, select: { targetId: true }, take: 12 }),
    prisma.follow.findUnique({ where: { followerId_targetType_targetId: { followerId: req.me.id, targetType: 'user', targetId: u.id } } }),
    relationsFor(req.me.id),
    prisma.follow.findUnique({ where: { followerId_targetType_targetId: { followerId: u.id, targetType: 'user', targetId: req.me.id } } }),
  ]);
  const self = u.id === req.me.id;
  const dms = prefs.privacy.allowDmsFrom;
  const canMessage = !self && !rel.blockedEitherWay.has(u.id) && (dms === 'everyone' || (dms === 'following' && !!followsMe));
  res.json({
    profile: { ...userCard(u, { showOnline: prefs.privacy.showOnline }), bio: u.bio, memberSince: u.createdAt, marketsFollowed: markets.map((m) => m.targetId) },
    counts: { followers, following, posts, ideas },
    viewer: {
      self,
      following: !!iFollow,
      blocked: (await prisma.userRelation.findUnique({ where: { userId_targetId_kind: { userId: req.me.id, targetId: u.id, kind: 'block' } } })) !== null,
      muted: (await prisma.userRelation.findUnique({ where: { userId_targetId_kind: { userId: req.me.id, targetId: u.id, kind: 'mute' } } })) !== null,
      canMessage,
      messageBlockedReason: canMessage || self ? null : rel.blockedEitherWay.has(u.id) ? 'Messaging is blocked between you.' : dms === 'nobody' ? 'This trader is not accepting direct messages.' : 'This trader only accepts messages from people they follow.',
    },
  });
}));

profilesRouter.get('/users/:username/:list(followers|following)', asyncHandler(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { username: String(req.params.username).toLowerCase() }, select: { id: true } });
  if (!u) return res.status(404).json({ error: 'Trader not found.' });
  const rows =
    req.params.list === 'followers'
      ? await prisma.follow.findMany({ where: { targetType: 'user', targetId: u.id }, orderBy: { createdAt: 'desc' }, take: 200, select: { followerId: true } })
      : await prisma.follow.findMany({ where: { followerId: u.id, targetType: 'user' }, orderBy: { createdAt: 'desc' }, take: 200, select: { targetId: true } });
  const ids = rows.map((r) => r.followerId ?? r.targetId);
  const { userCards } = await import('../../lib/community/users.js');
  const cards = await userCards(ids);
  res.json({ users: ids.map((id) => cards.get(id)).filter(Boolean) });
}));

// People search for @mentions, DMs and group invites.
profilesRouter.get('/people', asyncHandler(async (req, res) => {
  const q = str(req.query.q, 40).replace(/^@/, '');
  if (q.length < 1) return res.json({ users: [] });
  const users = await prisma.user.findMany({
    where: { status: 'active', username: { not: null }, id: { not: req.me.id }, OR: [{ username: { startsWith: q.toLowerCase() } }, { name: { contains: q, mode: 'insensitive' } }] },
    select: USER_CARD_SELECT,
    take: 12,
    orderBy: { lastSeenAt: 'desc' },
  });
  res.json({ users: users.map((u) => userCard(u, { showOnline: false })) });
}));
