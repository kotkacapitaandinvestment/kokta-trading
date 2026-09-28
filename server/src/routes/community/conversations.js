import crypto from 'node:crypto';
import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { publish, toUsers } from '../../lib/realtime.js';
import { conversationAccess, conversationChannels, ensureMember, isPublicConversation, MANAGER_ROLES, MOD_ROLES } from '../../lib/community/access.js';
import { userCards, userCard, relationsFor, loadPrefs, prefsFor, isStaff, USER_CARD_SELECT } from '../../lib/community/users.js';
import { normalizeAttachments, attachmentResolver, messageView, REACTIONS, excerpt } from '../../lib/community/serialize.js';
import { screenText, REVIEW_FLAGS } from '../../lib/community/safety.js';
import { overLimit } from '../../lib/community/throttle.js';
import { notify } from '../../lib/community/notify.js';
import { resolveMentions } from '../../lib/community/mentions.js';
import { mediaUrl } from '../../lib/media.js';
import { instrument } from '../../lib/instruments.js';
import { audit } from '../../lib/audit.js';
import { requireProfile, clampInt, str } from './context.js';

export const conversationsRouter = Router();

const MESSAGE_INCLUDE = {
  reactions: { select: { emoji: true, userId: true } },
  replyTo: { select: { id: true, authorId: true, body: true, deletedAt: true, removedById: true, attachments: true } },
};
const MAX_GROUP_MEMBERS = 256;

// ── helpers ────────────────────────────────────────────────────────────────

async function viewMessages(messages, viewerId) {
  const authorIds = messages.flatMap((m) => [m.authorId, m.replyTo?.authorId]).filter(Boolean);
  const [cards, rel] = await Promise.all([userCards(authorIds), viewerId ? relationsFor(viewerId) : { hidden: new Set() }]);
  const resolve = await attachmentResolver(messages.map((m) => m.attachments), { viewerId, cards });
  return messages.map((m) => messageView(m, { cards, resolve, viewerId, hidden: rel.hidden }));
}

// The live payload is viewer-neutral; clients fill in "mine" themselves.
async function liveMessage(message) {
  const full = await prisma.message.findUnique({ where: { id: message.id }, include: MESSAGE_INCLUDE });
  const [view] = await viewMessages([full], null);
  return { ...view, reactions: reactionDetail(full.reactions) };
}

function reactionDetail(reactions) {
  const by = new Map();
  for (const r of reactions) {
    const e = by.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [] };
    e.count += 1;
    if (e.userIds.length < 50) e.userIds.push(r.userId);
    by.set(r.emoji, e);
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

async function canDirectMessage(me, targetId) {
  if (targetId === me.id) return { error: "You can't message yourself." };
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, status: true, username: true } });
  if (!target || target.status !== 'active' || !target.username) return { error: 'We couldn’t find that trader. Their account may have been closed.' };
  const rel = await relationsFor(me.id);
  if (rel.blockedEitherWay.has(targetId)) return { error: "You can't message this trader." };
  const prefs = await loadPrefs(targetId);
  if (prefs.privacy.allowDmsFrom === 'nobody' && !isStaff(me)) return { error: 'This trader is not accepting direct messages.' };
  if (prefs.privacy.allowDmsFrom === 'following' && !isStaff(me)) {
    const f = await prisma.follow.findUnique({ where: { followerId_targetType_targetId: { followerId: targetId, targetType: 'user', targetId: me.id } } });
    if (!f) return { error: 'This trader only accepts messages from people they follow.' };
  }
  return { target };
}

function previewOf(m) {
  if (!m) return null;
  if (m.deletedAt) return 'Message deleted';
  if (m.removedById) return 'Removed by a moderator';
  if (m.body) return excerpt(m.body, 90);
  const a = Array.isArray(m.attachments) ? m.attachments[0] : null;
  return a ? { image: 'Photo', audio: 'Voice message', market: `Shared ${instrument(a.symbol)?.display ?? a.symbol}`, post: 'Shared a post', news: 'Shared news', event: 'Shared an event', poll: 'Poll' }[a.type] ?? 'Attachment' : '';
}

function conversationCard(c, { me, member, others, last, unread, memberCount }) {
  const other = c.kind === 'dm' ? others?.[0] ?? null : null;
  return {
    id: c.id,
    kind: c.kind,
    visibility: c.visibility,
    name: c.kind === 'dm' ? other?.name ?? 'Direct message' : c.name,
    imageUrl: c.kind === 'dm' ? other?.avatarUrl ?? null : c.imageId ? `/api/community/conversations/${c.id}/image` : null,
    instrument: c.instrument,
    eventId: c.eventId,
    other,
    memberCount,
    lastMessage: last ? { id: last.id, preview: previewOf(last), authorId: last.authorId, mine: last.authorId === me.id, createdAt: last.createdAt } : null,
    lastMessageAt: c.lastMessageAt,
    unread: unread ?? 0,
    muted: !!(member?.mutedUntil && member.mutedUntil > new Date()),
    archived: !!member?.archivedAt,
    role: member?.role ?? null,
    status: member?.status ?? null,
  };
}

// ── conversation list ──────────────────────────────────────────────────────

conversationsRouter.get('/conversations', asyncHandler(async (req, res) => {
  const filter = ['all', 'dm', 'group', 'community', 'room', 'archived'].includes(req.query.filter) ? req.query.filter : 'all';
  const memberships = await prisma.conversationMember.findMany({
    where: {
      userId: req.me.id,
      status: 'active',
      ...(filter === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
      conversation: { archivedAt: null, ...(filter !== 'all' && filter !== 'archived' ? { kind: filter } : { kind: { in: ['dm', 'group', 'community', 'room', 'event'] } }) },
    },
    include: { conversation: true },
    take: 300,
  });
  const convIds = memberships.map((m) => m.conversationId);
  if (!convIds.length) return res.json({ conversations: [] });
  const [lasts, unreadRows, dmOthers, counts] = await Promise.all([
    prisma.$queryRaw`
      SELECT DISTINCT ON ("conversationId") id, "conversationId", "authorId", body, attachments, "deletedAt", "removedById", "createdAt"
      FROM "Message" WHERE "conversationId" = ANY(${convIds}) AND "threadRootId" IS NULL
      ORDER BY "conversationId", "createdAt" DESC`,
    prisma.$queryRaw`
      SELECT m."conversationId", COUNT(*)::int AS n FROM "Message" m
      JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${req.me.id}
      WHERE m."conversationId" = ANY(${convIds}) AND m."threadRootId" IS NULL AND m."deletedAt" IS NULL
        AND (m."authorId" IS NULL OR m."authorId" <> ${req.me.id})
        AND m."createdAt" > COALESCE(cm."lastReadAt", cm."joinedAt")
      GROUP BY m."conversationId"`,
    prisma.conversationMember.findMany({ where: { conversationId: { in: memberships.filter((m) => m.conversation.kind === 'dm').map((m) => m.conversationId) }, userId: { not: req.me.id } }, select: { conversationId: true, userId: true } }),
    prisma.conversationMember.groupBy({ by: ['conversationId'], where: { conversationId: { in: convIds }, status: 'active' }, _count: { _all: true } }),
  ]);
  const cards = await userCards(dmOthers.map((d) => d.userId));
  const lastBy = new Map(lasts.map((l) => [l.conversationId, l]));
  const unreadBy = new Map(unreadRows.map((u) => [u.conversationId, u.n]));
  const otherBy = new Map(dmOthers.map((d) => [d.conversationId, cards.get(d.userId)]));
  const countBy = new Map(counts.map((c) => [c.conversationId, c._count._all]));
  const list = memberships
    .map((m) => conversationCard(m.conversation, { me: req.me, member: m, others: [otherBy.get(m.conversationId)].filter(Boolean), last: lastBy.get(m.conversationId), unread: unreadBy.get(m.conversationId), memberCount: countBy.get(m.conversationId) }))
    .sort((a, b) => new Date(b.lastMessageAt ?? 0) - new Date(a.lastMessageAt ?? 0));
  res.json({ conversations: list });
}));

// ── create ─────────────────────────────────────────────────────────────────

conversationsRouter.post('/conversations/dm', requireProfile, asyncHandler(async (req, res) => {
  const targetId = String(req.body?.userId ?? '');
  const { target, error } = await canDirectMessage(req.me, targetId);
  if (error) return res.status(403).json({ error });
  const dmKey = [req.me.id, target.id].sort().join(':');
  let conv = await prisma.conversation.findUnique({ where: { dmKey } });
  if (!conv) {
    try {
      conv = await prisma.conversation.create({
        data: { kind: 'dm', visibility: 'private', dmKey, createdById: req.me.id, joinPolicy: 'invite', members: { create: [{ userId: req.me.id, role: 'member' }, { userId: target.id, role: 'member' }] } },
      });
    } catch {
      conv = await prisma.conversation.findUnique({ where: { dmKey } });
    }
  } else {
    // Re-opening an archived or left chat.
    await prisma.conversationMember.updateMany({ where: { conversationId: conv.id, userId: req.me.id }, data: { status: 'active', archivedAt: null } });
  }
  res.status(201).json({ conversationId: conv.id });
}));

conversationsRouter.post('/conversations', requireProfile, asyncHandler(async (req, res) => {
  const kind = req.body?.kind === 'community' ? 'community' : 'group';
  const name = str(req.body?.name, 60);
  if (name.length < 3) return res.status(400).json({ error: 'Give it a name of at least 3 characters.' });
  const limited = await overLimit('conversation', req.me.id);
  if (limited) return res.status(429).json({ error: limited });
  const nameCheck = screenText(name, { staff: isStaff(req.me) });
  if (nameCheck.blocked) return res.status(400).json({ error: nameCheck.blocked });
  const visibility = kind === 'group' ? 'private' : ['public', 'private', 'invite_only'].includes(req.body?.visibility) ? req.body.visibility : 'public';
  const joinPolicy = kind === 'group' ? 'invite' : visibility === 'public' ? 'open' : visibility === 'private' ? 'approval' : 'invite';
  const sendPolicy = req.body?.sendPolicy === 'admins' ? 'admins' : 'everyone';
  let imageId = null;
  if (req.body?.imageMediaId) {
    const m = await prisma.media.findFirst({ where: { id: String(req.body.imageMediaId), ownerId: req.me.id, kind: 'image' }, select: { id: true } });
    imageId = m?.id ?? null;
  }
  const memberIds = [...new Set((Array.isArray(req.body?.memberIds) ? req.body.memberIds : []).map(String))].filter((id) => id !== req.me.id).slice(0, MAX_GROUP_MEMBERS - 1);
  const allowed = [];
  for (const id of memberIds) if (!(await canDirectMessage(req.me, id)).error) allowed.push(id);
  const conv = await prisma.conversation.create({
    data: {
      kind,
      visibility,
      joinPolicy,
      sendPolicy,
      name,
      description: str(req.body?.description, 300) || null,
      imageId,
      createdById: req.me.id,
      inviteCode: crypto.randomBytes(9).toString('base64url'),
      lastMessageAt: new Date(),
      members: { create: [{ userId: req.me.id, role: 'owner' }, ...allowed.map((userId) => ({ userId, role: 'member' }))] },
    },
  });
  await prisma.message.create({ data: { conversationId: conv.id, kind: 'system', body: `${req.me.name} created ${kind === 'group' ? 'the group' : 'the community'} "${name}"` } });
  if (allowed.length) {
    await notify(allowed.map((userId) => ({ userId, type: 'group', actorId: req.me.id, title: `${req.me.name} added you to "${name}"`, link: `/app/community/messages/${conv.id}` })));
    await publish(toUsers(allowed, 'conversation', { conversationId: conv.id }));
  }
  res.status(201).json({ conversationId: conv.id, skipped: memberIds.length - allowed.length });
}));

// Public and private (listed) communities.
conversationsRouter.get('/communities', asyncHandler(async (req, res) => {
  const q = str(req.query.q, 60);
  const rows = await prisma.conversation.findMany({
    where: { kind: 'community', visibility: { in: ['public', 'private'] }, archivedAt: null, ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) },
    orderBy: [{ featured: 'desc' }, { lastMessageAt: 'desc' }],
    take: 60,
  });
  const ids = rows.map((r) => r.id);
  const [counts, mine] = await Promise.all([
    prisma.conversationMember.groupBy({ by: ['conversationId'], where: { conversationId: { in: ids }, status: 'active' }, _count: { _all: true } }),
    prisma.conversationMember.findMany({ where: { conversationId: { in: ids }, userId: req.me.id }, select: { conversationId: true, status: true } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.conversationId, c._count._all]));
  const mineBy = new Map(mine.map((m) => [m.conversationId, m.status]));
  res.json({
    communities: rows.map((c) => ({ id: c.id, name: c.name, description: c.description, visibility: c.visibility, featured: c.featured, imageUrl: c.imageId ? `/api/community/conversations/${c.id}/image` : null, memberCount: countBy.get(c.id) ?? 0, lastMessageAt: c.lastMessageAt, membership: mineBy.get(c.id) ?? null })),
  });
}));

// ── one conversation ───────────────────────────────────────────────────────

conversationsRouter.get('/conversations/:id', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv) return res.status(404).json({ error: 'This chat was deleted, or you’re no longer in it.' });
  const c = a.conv;
  if (!a.canRead) {
    if (c.kind === 'community' && c.visibility === 'private') {
      const count = await prisma.conversationMember.count({ where: { conversationId: c.id, status: 'active' } });
      return res.json({ conversation: { id: c.id, kind: c.kind, name: c.name, description: c.description, visibility: c.visibility, memberCount: count }, access: { canRead: false, pending: a.member?.status === 'pending', canRequest: true } });
    }
    return res.status(403).json({ error: a.reason });
  }
  const showMembers = !isPublicConversation(c) || c.kind === 'community';
  const [members, memberCount, pins] = await Promise.all([
    showMembers ? prisma.conversationMember.findMany({ where: { conversationId: c.id, status: { in: ['active', 'pending'] } }, orderBy: { joinedAt: 'asc' }, take: 300, select: { userId: true, role: true, status: true, joinedAt: true, lastReadAt: true, lastDeliveredAt: true } }) : [],
    prisma.conversationMember.count({ where: { conversationId: c.id, status: 'active' } }),
    prisma.message.findMany({ where: { conversationId: c.id, pinnedAt: { not: null }, deletedAt: null, removedById: null }, orderBy: { pinnedAt: 'desc' }, take: 10, include: MESSAGE_INCLUDE }),
  ]);
  const cards = await userCards(members.map((m) => m.userId));
  const prefOf = await prefsFor(members.map((m) => m.userId));
  const others = members.filter((m) => m.userId !== req.me.id && m.status === 'active');
  const visibleMembers = members.filter((m) => m.status === 'active' || a.canManage);
  res.json({
    conversation: {
      ...conversationCard(c, { me: req.me, member: a.member, others: others.map((m) => cards.get(m.userId)).filter(Boolean), memberCount }),
      description: c.description,
      sendPolicy: c.sendPolicy,
      joinPolicy: c.joinPolicy,
      slug: c.slug,
      inviteCode: a.canManage ? c.inviteCode : null,
      createdAt: c.createdAt,
    },
    members: visibleMembers.map((m) => ({
      ...cards.get(m.userId),
      role: m.role,
      status: m.status,
      // Receipts only for people who share them.
      lastReadAt: prefOf(m.userId).privacy.readReceipts ? m.lastReadAt : null,
      lastDeliveredAt: m.lastDeliveredAt,
    })),
    pins: await viewMessages(pins, req.me.id),
    access: { canRead: true, canSend: a.canSend, sendBlockedReason: a.canSend ? null : a.reason, canModerate: a.canModerate, canManage: a.canManage, member: a.activeMember },
  });
}));

conversationsRouter.get('/conversations/:id/image', asyncHandler(async (req, res) => {
  const c = await prisma.conversation.findUnique({ where: { id: req.params.id }, select: { imageId: true } });
  const m = c?.imageId ? await prisma.media.findUnique({ where: { id: c.imageId }, select: { id: true, token: true } }) : null;
  if (!m) return res.status(404).end();
  res.redirect(302, mediaUrl(m));
}));

conversationsRouter.patch('/conversations/:id', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv || !a.canManage || a.conv.kind === 'dm') return res.status(403).json({ error: 'Only admins can change these settings.' });
  const data = {};
  if (req.body?.name !== undefined) {
    const name = str(req.body.name, 60);
    if (name.length < 3) return res.status(400).json({ error: 'Name must be at least 3 characters.' });
    data.name = name;
  }
  if (req.body?.description !== undefined) data.description = str(req.body.description, 300) || null;
  if (['everyone', 'admins'].includes(req.body?.sendPolicy)) data.sendPolicy = req.body.sendPolicy;
  if (a.conv.kind === 'community' && ['public', 'private', 'invite_only'].includes(req.body?.visibility)) {
    data.visibility = req.body.visibility;
    data.joinPolicy = { public: 'open', private: 'approval', invite_only: 'invite' }[req.body.visibility];
  }
  if (a.conv.kind === 'group' && ['invite', 'approval'].includes(req.body?.joinPolicy)) data.joinPolicy = req.body.joinPolicy;
  if (req.body?.imageMediaId !== undefined) {
    const m = req.body.imageMediaId ? await prisma.media.findFirst({ where: { id: String(req.body.imageMediaId), ownerId: req.me.id, kind: 'image' }, select: { id: true } }) : null;
    data.imageId = m?.id ?? null;
  }
  const conv = await prisma.conversation.update({ where: { id: a.conv.id }, data });
  await publish((await conversationChannels(conv)).map((channel) => ({ channel, type: 'conversation', payload: { conversationId: conv.id } })));
  res.json({ ok: true });
}));

// My own settings for a conversation: mute, archive.
conversationsRouter.patch('/conversations/:id/me', asyncHandler(async (req, res) => {
  const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: req.params.id, userId: req.me.id } } });
  if (!member) return res.status(404).json({ error: 'You are not in this conversation.' });
  const data = {};
  const DUR = { '8h': 8 * 3600e3, '1w': 7 * 86400e3, always: 100 * 365 * 86400e3 };
  if (req.body?.mute !== undefined) data.mutedUntil = req.body.mute && DUR[req.body.mute] ? new Date(Date.now() + DUR[req.body.mute]) : null;
  if (typeof req.body?.archived === 'boolean') data.archivedAt = req.body.archived ? new Date() : null;
  const updated = await prisma.conversationMember.update({ where: { id: member.id }, data });
  res.json({ muted: !!(updated.mutedUntil && updated.mutedUntil > new Date()), mutedUntil: updated.mutedUntil, archived: !!updated.archivedAt });
}));

// ── membership ─────────────────────────────────────────────────────────────

conversationsRouter.post('/conversations/:id/join', requireProfile, asyncHandler(async (req, res) => {
  const c = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!c || c.archivedAt) return res.status(404).json({ error: 'We couldn’t find that. It may have been removed.' });
  if (c.kind === 'dm' || c.kind === 'group' || (c.kind === 'community' && c.visibility === 'invite_only')) return res.status(403).json({ error: 'You need an invite to join this one.' });
  const pending = c.kind === 'community' && c.joinPolicy === 'approval';
  const existing = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: c.id, userId: req.me.id } } });
  if (existing?.status === 'removed') return res.status(403).json({ error: 'An admin removed you from this community.' });
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: c.id, userId: req.me.id } },
    update: { status: existing?.status === 'active' ? 'active' : pending ? 'pending' : 'active', archivedAt: null },
    create: { conversationId: c.id, userId: req.me.id, status: pending ? 'pending' : 'active', lastReadAt: new Date() },
  });
  if (pending && existing?.status !== 'active') {
    const admins = await prisma.conversationMember.findMany({ where: { conversationId: c.id, status: 'active', role: { in: MANAGER_ROLES } }, select: { userId: true } });
    await notify(admins.map((m) => ({ userId: m.userId, type: 'group', actorId: req.me.id, title: `${req.me.name} asked to join "${c.name}"`, link: `/app/community/messages/${c.id}`, groupKey: `join:${c.id}` })));
  }
  res.json({ status: pending && existing?.status !== 'active' ? 'pending' : 'active' });
}));

conversationsRouter.get('/invite/:code', asyncHandler(async (req, res) => {
  const c = await prisma.conversation.findUnique({ where: { inviteCode: String(req.params.code) } });
  if (!c || c.archivedAt) return res.status(404).json({ error: 'This invite link has expired. Ask an admin of the group for a new one.' });
  const count = await prisma.conversationMember.count({ where: { conversationId: c.id, status: 'active' } });
  res.json({ conversation: { id: c.id, kind: c.kind, name: c.name, description: c.description, memberCount: count, joinPolicy: c.joinPolicy } });
}));

conversationsRouter.post('/invite/:code/join', requireProfile, asyncHandler(async (req, res) => {
  const c = await prisma.conversation.findUnique({ where: { inviteCode: String(req.params.code) } });
  if (!c || c.archivedAt) return res.status(404).json({ error: 'This invite link has expired. Ask an admin of the group for a new one.' });
  const existing = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: c.id, userId: req.me.id } } });
  if (existing?.status === 'removed') return res.status(403).json({ error: 'An admin removed you from this chat.' });
  const count = await prisma.conversationMember.count({ where: { conversationId: c.id, status: 'active' } });
  if (c.kind === 'group' && count >= MAX_GROUP_MEMBERS) return res.status(409).json({ error: `This group is full (${MAX_GROUP_MEMBERS} members).` });
  const status = c.joinPolicy === 'approval' && existing?.status !== 'active' ? 'pending' : 'active';
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: c.id, userId: req.me.id } },
    update: { status: existing?.status === 'active' ? 'active' : status, archivedAt: null },
    create: { conversationId: c.id, userId: req.me.id, status, lastReadAt: new Date() },
  });
  if (status === 'active' && existing?.status !== 'active') {
    await prisma.message.create({ data: { conversationId: c.id, kind: 'system', body: `${req.me.name} joined with an invite link` } });
    await publish((await conversationChannels(c)).map((channel) => ({ channel, type: 'conversation', payload: { conversationId: c.id } })));
  }
  res.json({ conversationId: c.id, status });
}));

conversationsRouter.post('/conversations/:id/invite', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv || !a.canManage || a.conv.kind === 'dm') return res.status(403).json({ error: 'Only admins can manage invite links.' });
  const conv = await prisma.conversation.update({ where: { id: a.conv.id }, data: { inviteCode: crypto.randomBytes(9).toString('base64url') } });
  res.json({ inviteCode: conv.inviteCode });
}));

conversationsRouter.post('/conversations/:id/members', requireProfile, asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv || !a.canManage || !['group', 'community'].includes(a.conv.kind)) return res.status(403).json({ error: 'Only admins can add members.' });
  const ids = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(String))].slice(0, 50);
  const count = await prisma.conversationMember.count({ where: { conversationId: a.conv.id, status: 'active' } });
  const added = [];
  for (const id of ids) {
    if (a.conv.kind === 'group' && count + added.length >= MAX_GROUP_MEMBERS) break;
    if ((await canDirectMessage(req.me, id)).error) continue;
    await prisma.conversationMember.upsert({ where: { conversationId_userId: { conversationId: a.conv.id, userId: id } }, update: { status: 'active', archivedAt: null }, create: { conversationId: a.conv.id, userId: id, lastReadAt: new Date() } });
    added.push(id);
  }
  if (added.length) {
    const cards = await userCards(added);
    await prisma.message.create({ data: { conversationId: a.conv.id, kind: 'system', body: `${req.me.name} added ${added.map((id) => cards.get(id)?.name).filter(Boolean).join(', ')}` } });
    await notify(added.map((userId) => ({ userId, type: 'group', actorId: req.me.id, title: `${req.me.name} added you to "${a.conv.name}"`, link: `/app/community/messages/${a.conv.id}` })));
    await publish([...(await conversationChannels(a.conv)).map((channel) => ({ channel, type: 'conversation', payload: { conversationId: a.conv.id } }))]);
  }
  res.json({ added: added.length, skipped: ids.length - added.length });
}));

conversationsRouter.patch('/conversations/:id/members/:userId', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv || !a.canManage) return res.status(403).json({ error: 'Only admins can change roles.' });
  const target = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: a.conv.id, userId: req.params.userId } } });
  if (!target) return res.status(404).json({ error: 'They’re no longer in this chat.' });
  if (req.body?.approve === true && target.status === 'pending') {
    await prisma.conversationMember.update({ where: { id: target.id }, data: { status: 'active', lastReadAt: new Date() } });
    await notify([{ userId: target.userId, type: 'group', actorId: req.me.id, title: `You're in: "${a.conv.name}"`, link: `/app/community/messages/${a.conv.id}` }]);
    return res.json({ status: 'active' });
  }
  const role = req.body?.role;
  if (!['admin', 'moderator', 'member'].includes(role)) return res.status(400).json({ error: 'Choose a role from the list.' });
  if (target.role === 'owner') return res.status(403).json({ error: "The owner's role can't be changed." });
  if (role === 'admin' && a.member?.role !== 'owner' && !isStaff(req.me)) return res.status(403).json({ error: 'Only the owner can make admins.' });
  await prisma.conversationMember.update({ where: { id: target.id }, data: { role } });
  res.json({ role });
}));

conversationsRouter.delete('/conversations/:id/members/:userId', asyncHandler(async (req, res) => {
  const self = req.params.userId === req.me.id;
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv) return res.status(404).json({ error: 'We couldn’t find that. It may have been removed.' });
  if (!self && !a.canManage) return res.status(403).json({ error: 'Only admins can remove members.' });
  const target = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: a.conv.id, userId: req.params.userId } } });
  if (!target) return res.status(404).json({ error: 'They’re no longer in this chat.' });
  if (!self && target.role === 'owner') return res.status(403).json({ error: "The owner can't be removed." });
  await prisma.conversationMember.update({ where: { id: target.id }, data: { status: self ? 'left' : 'removed' } });
  if (self && target.role === 'owner') {
    const heir = await prisma.conversationMember.findFirst({ where: { conversationId: a.conv.id, status: 'active' }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] });
    if (heir) await prisma.conversationMember.update({ where: { id: heir.id }, data: { role: 'owner' } });
  }
  if (a.conv.kind !== 'dm') {
    const cards = await userCards([req.params.userId]);
    await prisma.message.create({ data: { conversationId: a.conv.id, kind: 'system', body: self ? `${cards.get(req.params.userId)?.name} left` : `${req.me.name} removed ${cards.get(req.params.userId)?.name}` } });
  }
  res.json({ ok: true });
}));

// ── messages ───────────────────────────────────────────────────────────────

conversationsRouter.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv) return res.status(404).json({ error: 'This chat was deleted, or you’re no longer in it.' });
  if (!a.canRead) return res.status(403).json({ error: a.reason });
  const limit = clampInt(req.query.limit, 1, 100, 50);
  const thread = typeof req.query.thread === 'string' ? req.query.thread : null;
  const where = { conversationId: a.conv.id, threadRootId: thread ?? null };
  if (typeof req.query.before === 'string') {
    const pivot = await prisma.message.findUnique({ where: { id: req.query.before }, select: { createdAt: true } });
    if (pivot) where.createdAt = { lt: pivot.createdAt };
  }
  if (typeof req.query.after === 'string') {
    const pivot = await prisma.message.findUnique({ where: { id: req.query.after }, select: { createdAt: true } });
    if (pivot) where.createdAt = { gt: pivot.createdAt };
  }
  const rows = await prisma.message.findMany({ where, orderBy: { createdAt: req.query.after ? 'asc' : 'desc' }, take: limit + 1, include: MESSAGE_INCLUDE });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  if (!req.query.after) page.reverse();
  let root = null;
  if (thread) {
    const r = await prisma.message.findFirst({ where: { id: thread, conversationId: a.conv.id }, include: MESSAGE_INCLUDE });
    if (r) [root] = await viewMessages([r], req.me.id);
  }
  res.json({ messages: await viewMessages(page, req.me.id), hasMore, root });
}));

// A page centred on one message (opening a search result or a pin).
conversationsRouter.get('/conversations/:id/messages/around/:messageId', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv || !a.canRead) return res.status(403).json({ error: a.reason ?? 'We couldn’t find that. It may have been removed.' });
  const pivot = await prisma.message.findFirst({ where: { id: req.params.messageId, conversationId: a.conv.id } });
  if (!pivot) return res.status(404).json({ error: 'That message was deleted.' });
  const scope = { conversationId: a.conv.id, threadRootId: pivot.threadRootId ?? null };
  const [before, after] = await Promise.all([
    prisma.message.findMany({ where: { ...scope, createdAt: { lt: pivot.createdAt } }, orderBy: { createdAt: 'desc' }, take: 25, include: MESSAGE_INCLUDE }),
    prisma.message.findMany({ where: { ...scope, createdAt: { gte: pivot.createdAt } }, orderBy: { createdAt: 'asc' }, take: 25, include: MESSAGE_INCLUDE }),
  ]);
  res.json({ messages: await viewMessages([...before.reverse(), ...after], req.me.id), hasMore: before.length === 25, focusId: pivot.id, threadRootId: pivot.threadRootId });
}));

conversationsRouter.post('/conversations/:id/messages', requireProfile, asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv) return res.status(404).json({ error: 'This chat was deleted, or you’re no longer in it.' });
  if (!a.canSend) return res.status(403).json({ error: a.reason });
  const body = typeof req.body?.body === 'string' ? req.body.body.replace(/\s+$/, '').slice(0, 4000) : '';
  const pollIn = req.body?.poll && typeof req.body.poll === 'object' ? req.body.poll : null;
  let poll = null;
  if (pollIn) {
    const question = str(pollIn.question, 200);
    const options = (Array.isArray(pollIn.options) ? pollIn.options : []).map((o) => str(o, 80)).filter(Boolean);
    if (!question || options.length < 2 || options.length > 6) return res.status(400).json({ error: 'A poll needs a question and 2 to 6 options.' });
    poll = { question, options };
  }
  const screen = screenText(`${body} ${poll?.question ?? ''} ${(poll?.options ?? []).join(' ')}`, { staff: isStaff(req.me) });
  if (screen.blocked) return res.status(400).json({ error: screen.blocked, code: 'blocked_content' });

  // Independent checks in parallel (each is a database round-trip).
  const [norm, limited, replyTo, threadRoot, mentioned] = await Promise.all([
    normalizeAttachments(req.me.id, req.body?.attachments),
    overLimit('message', req.me.id),
    req.body?.replyToId ? prisma.message.findFirst({ where: { id: String(req.body.replyToId), conversationId: a.conv.id }, select: { id: true, authorId: true, threadRootId: true } }) : null,
    req.body?.threadRootId ? prisma.message.findFirst({ where: { id: String(req.body.threadRootId), conversationId: a.conv.id, threadRootId: null }, select: { id: true, authorId: true } }) : null,
    resolveMentions(body),
  ]);
  if (norm.error) return res.status(400).json({ error: norm.error });
  const { attachments } = norm;
  if (!body.trim() && !attachments.length && !poll) return res.status(400).json({ error: 'Write a message or attach something.' });
  if (limited) return res.status(429).json({ error: limited });
  if (req.body?.replyToId && !replyTo) return res.status(400).json({ error: 'The message you’re replying to isn’t in this conversation any more.' });
  if (req.body?.threadRootId && !threadRoot) return res.status(400).json({ error: 'That thread isn’t in this conversation any more.' });

  let mentions = mentioned;
  if (!isPublicConversation(a.conv) && mentions.length) {
    const members = await prisma.conversationMember.findMany({ where: { conversationId: a.conv.id, userId: { in: mentions }, status: 'active' }, select: { userId: true } });
    mentions = members.map((m) => m.userId);
  }

  if (!a.activeMember) await ensureMember(a.conv.id, req.me.id);
  const now = new Date();
  const message = await prisma.message.create({
    data: { conversationId: a.conv.id, authorId: req.me.id, body, attachments, mentions, flags: screen.flags, replyToId: replyTo?.id ?? null, threadRootId: threadRoot?.id ?? null },
  });
  if (poll) {
    const p = await prisma.poll.create({ data: { messageId: message.id, question: poll.question, options: { create: poll.options.map((label, position) => ({ label, position })) } } });
    await prisma.message.update({ where: { id: message.id }, data: { attachments: [...attachments, { type: 'poll', pollId: p.id }] } });
  }
  await Promise.all([
    threadRoot
      ? prisma.message.update({ where: { id: threadRoot.id }, data: { threadCount: { increment: 1 }, lastThreadAt: now } })
      : prisma.conversation.update({ where: { id: a.conv.id }, data: { lastMessageAt: now, messageCount: { increment: 1 } } }),
    prisma.conversationMember.updateMany({ where: { conversationId: a.conv.id, userId: req.me.id }, data: { lastReadAt: now, archivedAt: null } }),
  ]);
  // Unarchive for everyone in private chats when a new message arrives.
  if (!isPublicConversation(a.conv) && !threadRoot) await prisma.conversationMember.updateMany({ where: { conversationId: a.conv.id, archivedAt: { not: null }, status: 'active' }, data: { archivedAt: null } });

  const [live, channels] = await Promise.all([liveMessage(message), conversationChannels(a.conv)]);
  await publish(channels.map((channel) => ({ channel, type: 'message', payload: { conversationId: a.conv.id, kind: a.conv.kind, message: live } })));
  if (threadRoot) await publish(channels.map((channel) => ({ channel, type: 'thread', payload: { conversationId: a.conv.id, rootId: threadRoot.id, lastThreadAt: now } })));

  // Deliver first; notifications and moderation queueing run after the
  // response so the sender never waits on them.
  res.status(201).json({ message: live });
  waitUntil(
    (async () => {
      const link = `/app/community/${a.conv.kind === 'room' ? `markets/${a.conv.instrument}` : a.conv.kind === 'event' ? `events/${a.conv.eventId}` : `messages/${a.conv.id}`}?m=${message.id}`;
      const out = [];
      const title = a.conv.kind === 'dm' ? `${req.me.name}` : `${req.me.name} in ${a.conv.name}`;
      if ((a.conv.kind === 'dm' || a.conv.kind === 'group') && !threadRoot) {
        const members = await prisma.conversationMember.findMany({ where: { conversationId: a.conv.id, status: 'active', userId: { not: req.me.id }, OR: [{ mutedUntil: null }, { mutedUntil: { lt: now } }] }, select: { userId: true } });
        for (const m of members) out.push({ userId: m.userId, type: 'message', actorId: req.me.id, title, body: previewOf(live), link, groupKey: `msg:${a.conv.id}`, data: { conversationId: a.conv.id } });
      }
      const replyTarget = replyTo?.authorId ?? threadRoot?.authorId;
      if (replyTarget && replyTarget !== req.me.id) out.push({ userId: replyTarget, type: 'reply', actorId: req.me.id, title: `${req.me.name} replied to you${a.conv.kind === 'dm' ? '' : ` in ${a.conv.name}`}`, body: excerpt(body, 120), link, groupKey: `reply:${a.conv.id}` });
      for (const uid of mentions) if (uid !== replyTarget) out.push({ userId: uid, type: 'mention', actorId: req.me.id, title: `${req.me.name} mentioned you in ${a.conv.kind === 'dm' ? 'a message' : a.conv.name}`, body: excerpt(body, 120), link });
      await notify(out);

      if (screen.flags.some((f) => REVIEW_FLAGS.has(f))) {
        await prisma.report.create({ data: { targetType: 'message', targetId: message.id, targetUserId: req.me.id, category: 'scam', details: `Automatic screening: ${screen.flags.join(', ')}`, auto: true } });
      }
    })().catch((err) => console.error('Message follow-up failed:', err)),
  );
}));

async function ownMessage(req, res) {
  const m = await prisma.message.findUnique({ where: { id: req.params.id }, include: { conversation: true } });
  if (!m) {
    res.status(404).json({ error: 'That message was deleted.' });
    return null;
  }
  return m;
}

conversationsRouter.patch('/messages/:id', requireProfile, asyncHandler(async (req, res) => {
  const m = await ownMessage(req, res);
  if (!m) return;
  if (m.authorId !== req.me.id) return res.status(403).json({ error: 'You can only edit your own messages.' });
  if (m.deletedAt || m.removedById) return res.status(400).json({ error: 'This message was deleted.' });
  const body = typeof req.body?.body === 'string' ? req.body.body.replace(/\s+$/, '').slice(0, 4000) : '';
  if (!body.trim() && !(m.attachments ?? []).length) return res.status(400).json({ error: 'A message cannot be empty.' });
  const screen = screenText(body, { staff: isStaff(req.me) });
  if (screen.blocked) return res.status(400).json({ error: screen.blocked, code: 'blocked_content' });
  await prisma.message.update({ where: { id: m.id }, data: { body, flags: screen.flags, editedAt: new Date(), mentions: await resolveMentions(body) } });
  const live = await liveMessage(m);
  await publish((await conversationChannels(m.conversation)).map((channel) => ({ channel, type: 'message_updated', payload: { conversationId: m.conversationId, message: live } })));
  res.json({ message: live });
}));

conversationsRouter.delete('/messages/:id', asyncHandler(async (req, res) => {
  const m = await ownMessage(req, res);
  if (!m) return;
  const a = await conversationAccess(m.conversation, req.me);
  const own = m.authorId === req.me.id;
  if (!own && !a.canModerate) return res.status(403).json({ error: 'You can only delete your own messages.' });
  if (own) await prisma.message.update({ where: { id: m.id }, data: { deletedAt: new Date(), pinnedAt: null } });
  else {
    await prisma.message.update({ where: { id: m.id }, data: { removedById: req.me.id, pinnedAt: null } });
    await prisma.moderationAction.create({ data: { moderatorId: req.me.id, action: 'remove', targetType: 'message', targetId: m.id, targetUserId: m.authorId, reason: str(req.body?.reason, 300) || null } });
    await audit(req, 'community.message_removed', { targetType: 'message', targetId: m.id, detail: { conversationId: m.conversationId } });
  }
  const live = await liveMessage(m);
  await publish((await conversationChannels(m.conversation)).map((channel) => ({ channel, type: 'message_updated', payload: { conversationId: m.conversationId, message: live } })));
  res.json({ message: live });
}));

conversationsRouter.post('/messages/:id/reactions', requireProfile, asyncHandler(async (req, res) => {
  const emoji = String(req.body?.emoji ?? '');
  if (!REACTIONS.includes(emoji)) return res.status(400).json({ error: 'That reaction isn’t available.' });
  const m = await ownMessage(req, res);
  if (!m) return;
  const a = await conversationAccess(m.conversation, req.me);
  if (!a.canRead || m.deletedAt || m.removedById) return res.status(403).json({ error: 'Join this chat to react to messages.' });
  const key = { messageId_userId_emoji: { messageId: m.id, userId: req.me.id, emoji } };
  const existing = await prisma.messageReaction.findUnique({ where: key });
  if (existing) await prisma.messageReaction.delete({ where: key });
  else {
    await prisma.messageReaction.create({ data: { messageId: m.id, userId: req.me.id, emoji } });
    if (m.authorId && m.authorId !== req.me.id && ['dm', 'group'].includes(m.conversation.kind)) {
      await notify([{ userId: m.authorId, type: 'reaction', actorId: req.me.id, title: `${req.me.name} reacted ${emoji} to your message`, body: excerpt(m.body, 80), link: `/app/community/messages/${m.conversationId}?m=${m.id}`, groupKey: `react:msg:${m.id}` }]);
    }
  }
  const reactions = reactionDetail(await prisma.messageReaction.findMany({ where: { messageId: m.id }, select: { emoji: true, userId: true } }));
  await publish((await conversationChannels(m.conversation)).map((channel) => ({ channel, type: 'reaction', payload: { conversationId: m.conversationId, messageId: m.id, reactions } })));
  res.json({ reactions });
}));

conversationsRouter.post('/messages/:id/pin', asyncHandler(async (req, res) => {
  const m = await ownMessage(req, res);
  if (!m) return;
  const a = await conversationAccess(m.conversation, req.me);
  const allowed = a.canModerate || (m.conversation.kind === 'dm' && a.activeMember);
  if (!allowed) return res.status(403).json({ error: 'Only admins and moderators can pin messages.' });
  const pin = req.body?.pinned !== false;
  await prisma.message.update({ where: { id: m.id }, data: { pinnedAt: pin ? new Date() : null, pinnedById: pin ? req.me.id : null } });
  const live = await liveMessage(m);
  await publish((await conversationChannels(m.conversation)).map((channel) => ({ channel, type: 'message_updated', payload: { conversationId: m.conversationId, message: live, pinsChanged: true } })));
  res.json({ message: live });
}));

// ── receipts, typing, search ───────────────────────────────────────────────

conversationsRouter.post('/conversations/:id/read', asyncHandler(async (req, res) => {
  const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: req.params.id, userId: req.me.id } }, include: { conversation: true } });
  if (!member) return res.json({ ok: true });
  const at = new Date();
  await prisma.conversationMember.update({ where: { id: member.id }, data: { lastReadAt: at, lastDeliveredAt: at } });
  await prisma.notification.updateMany({ where: { userId: req.me.id, groupKey: `msg:${member.conversationId}`, readAt: null }, data: { readAt: at } });
  if (['dm', 'group'].includes(member.conversation.kind) && (await loadPrefs(req.me.id)).privacy.readReceipts) {
    await publish((await conversationChannels(member.conversation)).map((channel) => ({ channel, type: 'read', payload: { conversationId: member.conversationId, userId: req.me.id, at } })));
  }
  res.json({ ok: true, at });
}));

conversationsRouter.post('/conversations/:id/delivered', asyncHandler(async (req, res) => {
  const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: req.params.id, userId: req.me.id } }, include: { conversation: true } });
  if (!member || !['dm', 'group'].includes(member.conversation.kind)) return res.json({ ok: true });
  const at = new Date();
  await prisma.conversationMember.update({ where: { id: member.id }, data: { lastDeliveredAt: at } });
  await publish((await conversationChannels(member.conversation)).map((channel) => ({ channel, type: 'delivered', payload: { conversationId: member.conversationId, userId: req.me.id, at } })));
  res.json({ ok: true });
}));

conversationsRouter.post('/conversations/:id/typing', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv || !a.canSend || !req.me.username) return res.json({ ok: false });
  const channels = (await conversationChannels(a.conv)).filter((c) => c !== `user:${req.me.id}`);
  await publish(channels.map((channel) => ({ channel, type: 'typing', payload: { conversationId: a.conv.id, threadRootId: req.body?.threadRootId ?? null, user: { id: req.me.id, name: req.me.name, username: req.me.username } } })));
  res.json({ ok: true });
}));

conversationsRouter.get('/conversations/:id/search', asyncHandler(async (req, res) => {
  const a = await conversationAccess(req.params.id, req.me);
  if (!a.conv || !a.canRead) return res.status(403).json({ error: a.reason ?? 'We couldn’t find that. It may have been removed.' });
  const q = str(req.query.q, 100);
  if (q.length < 2) return res.json({ messages: [] });
  const rows = await prisma.message.findMany({
    where: { conversationId: a.conv.id, deletedAt: null, removedById: null, body: { contains: q, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: MESSAGE_INCLUDE,
  });
  res.json({ messages: await viewMessages(rows, req.me.id) });
}));

export { viewMessages, liveMessage, MESSAGE_INCLUDE, reactionDetail };
export const _internals = { canDirectMessage, USER_CARD_SELECT, userCard };
