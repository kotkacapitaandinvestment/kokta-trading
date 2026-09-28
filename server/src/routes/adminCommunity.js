import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth, requireRole, forgetUserAccess } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { userCards, userCard, USER_CARD_SELECT } from '../lib/community/users.js';
import { instrumentsForCurrency } from '../lib/instruments.js';
import { eventView } from '../lib/community/posts.js';
import { notify } from '../lib/community/notify.js';
import { publish } from '../lib/realtime.js';
import { conversationChannels } from '../lib/community/access.js';
import { revokeUserSessions } from '../lib/sessions.js';

// Moderators, admins and super admins. Suspending or banning an account is
// admin-only; moderators can remove content and pause posting.
export const adminCommunityRouter = Router();
adminCommunityRouter.use(requireAuth, requireRole('moderator', 'admin', 'super_admin'));

const DAY = 86400e3;
const isAdmin = (u) => ['admin', 'super_admin'].includes(u.role);
// Staff can only act on people ranked below them (super admins on anyone).
const RANK = { trader: 0, premium: 0, moderator: 1, admin: 2, super_admin: 3 };
async function outranks(actor, targetUserId) {
  if (!targetUserId || actor.role === 'super_admin') return true;
  const t = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
  return !t || (RANK[t.role] ?? 0) < (RANK[actor.role] ?? 0);
}
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

// ── overview & analytics ───────────────────────────────────────────────────
adminCommunityRouter.get('/overview', asyncHandler(async (req, res) => {
  const now = Date.now();
  const d1 = new Date(now - DAY);
  const [members, active1d, messages1d, posts1d, ideas, openIdeas, activeRooms, upcomingEvents, openReports, actions7d, dmActive] = await Promise.all([
    prisma.user.count({ where: { username: { not: null } } }),
    prisma.$queryRaw`SELECT COUNT(DISTINCT uid)::int AS n FROM (SELECT "authorId" AS uid FROM "Message" WHERE "createdAt" >= ${d1} UNION SELECT "authorId" FROM "Post" WHERE "createdAt" >= ${d1} UNION SELECT "authorId" FROM "Comment" WHERE "createdAt" >= ${d1}) t WHERE uid IS NOT NULL`.then((r) => r[0].n),
    prisma.message.count({ where: { createdAt: { gte: d1 }, kind: 'text' } }),
    prisma.post.count({ where: { createdAt: { gte: d1 } } }),
    prisma.post.count({ where: { kind: 'idea', deletedAt: null, removedAt: null } }),
    prisma.tradeIdea.count({ where: { status: { in: ['open', 'updated'] } } }),
    prisma.$queryRaw`SELECT COUNT(DISTINCT "conversationId")::int AS n FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE m."createdAt" >= ${d1} AND c.kind IN ('room','event','community')`.then((r) => r[0].n),
    prisma.marketEvent.count({ where: { cancelled: false, scheduledAt: { gte: new Date(), lte: new Date(now + 7 * DAY) } } }),
    prisma.report.count({ where: { status: 'open' } }),
    prisma.moderationAction.count({ where: { createdAt: { gte: new Date(now - 7 * DAY) } } }),
    prisma.$queryRaw`SELECT COUNT(DISTINCT m."conversationId")::int AS n FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE m."createdAt" >= ${d1} AND c.kind IN ('dm','group')`.then((r) => r[0].n),
  ]);
  res.json({ members, activeToday: active1d, messagesToday: messages1d, postsToday: posts1d, ideas, openIdeas, activeRooms, upcomingEvents, openReports, moderationActions7d: actions7d, privateConversationsActive: dmActive });
}));

adminCommunityRouter.get('/analytics', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
  const since = new Date(Date.now() - days * DAY);
  const [daily, hours, markets, events, retention] = await Promise.all([
    prisma.$queryRaw`
      SELECT d::date AS day,
        (SELECT COUNT(*)::int FROM "Message" WHERE "createdAt" >= d AND "createdAt" < d + interval '1 day' AND kind = 'text') AS messages,
        (SELECT COUNT(*)::int FROM "Post" WHERE "createdAt" >= d AND "createdAt" < d + interval '1 day') AS posts,
        (SELECT COUNT(*)::int FROM "Comment" WHERE "createdAt" >= d AND "createdAt" < d + interval '1 day') AS comments,
        (SELECT COUNT(DISTINCT uid)::int FROM (SELECT "authorId" AS uid FROM "Message" WHERE "createdAt" >= d AND "createdAt" < d + interval '1 day' UNION SELECT "authorId" FROM "Post" WHERE "createdAt" >= d AND "createdAt" < d + interval '1 day' UNION SELECT "authorId" FROM "Comment" WHERE "createdAt" >= d AND "createdAt" < d + interval '1 day') t WHERE uid IS NOT NULL) AS active
      FROM generate_series(date_trunc('day', ${since}::timestamp), date_trunc('day', now()), interval '1 day') AS d ORDER BY d`,
    prisma.$queryRaw`SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::int AS n FROM "Message" WHERE "createdAt" >= ${since} AND kind = 'text' GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw`
      SELECT instrument, SUM(n)::int AS n FROM (
        SELECT c.instrument, COUNT(*) AS n FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE c.kind = 'room' AND m."createdAt" >= ${since} GROUP BY c.instrument
        UNION ALL SELECT instrument, COUNT(*) FROM "Post" WHERE instrument IS NOT NULL AND "createdAt" >= ${since} GROUP BY instrument
      ) t GROUP BY instrument ORDER BY n DESC LIMIT 10`,
    prisma.$queryRaw`
      SELECT e.id, e.title, e.currency, e."scheduledAt", COUNT(m.id)::int AS messages, COUNT(DISTINCT m."authorId")::int AS participants
      FROM "MarketEvent" e JOIN "Conversation" c ON c."eventId" = e.id JOIN "Message" m ON m."conversationId" = c.id
      WHERE e."scheduledAt" >= ${since} GROUP BY e.id ORDER BY participants DESC LIMIT 10`,
    // Of people active in the first week of the window, how many were active in the last week.
    prisma.$queryRaw`
      WITH act AS (SELECT "authorId" AS uid, "createdAt" AS at FROM "Message" WHERE "authorId" IS NOT NULL UNION ALL SELECT "authorId", "createdAt" FROM "Post" UNION ALL SELECT "authorId", "createdAt" FROM "Comment")
      SELECT (SELECT COUNT(DISTINCT uid)::int FROM act WHERE at >= ${since} AND at < ${new Date(since.getTime() + 7 * DAY)}) AS cohort,
             (SELECT COUNT(DISTINCT a.uid)::int FROM act a WHERE a.at >= ${new Date(Date.now() - 7 * DAY)} AND a.uid IN (SELECT uid FROM act WHERE at >= ${since} AND at < ${new Date(since.getTime() + 7 * DAY)})) AS retained`,
  ]);
  res.json({ days, daily, activeHoursUtc: hours, mostDiscussedMarkets: markets, eventParticipation: events, retention: retention[0] });
}));

// ── moderation queue ───────────────────────────────────────────────────────
async function reportTargets(reports) {
  const ids = (t) => reports.filter((r) => r.targetType === t).map((r) => r.targetId);
  const [posts, comments, messages, convs] = await Promise.all([
    prisma.post.findMany({ where: { id: { in: ids('post') } }, include: { idea: true } }),
    prisma.comment.findMany({ where: { id: { in: ids('comment') } } }),
    prisma.message.findMany({ where: { id: { in: ids('message') } }, include: { conversation: { select: { id: true, kind: true, name: true } } } }),
    prisma.conversation.findMany({ where: { id: { in: ids('conversation') } }, select: { id: true, kind: true, name: true, description: true } }),
  ]);
  const map = new Map();
  for (const p of posts) map.set(`post:${p.id}`, { text: p.idea ? `${p.body}\n\nThesis: ${p.idea.thesis}` : p.body, attachments: p.attachments, removed: !!p.removedAt, deleted: !!p.deletedAt, link: `/app/community/${p.kind === 'idea' ? 'ideas' : 'posts'}/${p.id}`, createdAt: p.createdAt });
  for (const c of comments) map.set(`comment:${c.id}`, { text: c.body, removed: !!c.removedById, deleted: !!c.deletedAt, createdAt: c.createdAt });
  // Private-conversation text is shown to moderators only because it was reported.
  for (const m of messages) map.set(`message:${m.id}`, { text: m.body, attachments: m.attachments, removed: !!m.removedById, deleted: !!m.deletedAt, context: m.conversation, createdAt: m.createdAt });
  for (const c of convs) map.set(`conversation:${c.id}`, { text: `${c.name}\n${c.description ?? ''}`, context: c });
  return map;
}

adminCommunityRouter.get('/reports', asyncHandler(async (req, res) => {
  const status = ['open', 'actioned', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const reports = await prisma.report.findMany({ where: { status }, orderBy: status === 'open' ? [{ auto: 'asc' }, { createdAt: 'asc' }] : { resolvedAt: 'desc' }, take: 100 });
  const [cards, targets, counts, priorByUser] = await Promise.all([
    userCards(reports.flatMap((r) => [r.reporterId, r.targetUserId, r.resolvedById])),
    reportTargets(reports),
    prisma.report.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.report.groupBy({ by: ['targetUserId'], where: { targetUserId: { in: reports.map((r) => r.targetUserId).filter(Boolean) } }, _count: { _all: true } }),
  ]);
  const priorBy = new Map(priorByUser.map((p) => [p.targetUserId, p._count._all]));
  const users = await prisma.user.findMany({ where: { id: { in: reports.map((r) => r.targetUserId).filter(Boolean) } }, select: { id: true, status: true, communityMutedUntil: true } });
  const userBy = new Map(users.map((u) => [u.id, u]));
  res.json({
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    reports: reports.map((r) => ({
      ...r,
      reporter: r.reporterId ? cards.get(r.reporterId) : null,
      targetUser: r.targetUserId ? { ...cards.get(r.targetUserId), accountStatus: userBy.get(r.targetUserId)?.status, mutedUntil: userBy.get(r.targetUserId)?.communityMutedUntil, reportsTotal: priorBy.get(r.targetUserId) ?? 0 } : null,
      resolvedBy: r.resolvedById ? cards.get(r.resolvedById) : null,
      target: targets.get(`${r.targetType}:${r.targetId}`) ?? null,
    })),
  });
}));

// Who wrote a piece of content (for rank checks).
async function contentOwner(type, id) {
  if (!id) return null;
  if (type === 'post') return (await prisma.post.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null;
  if (type === 'comment') return (await prisma.comment.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null;
  if (type === 'message') return (await prisma.message.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null;
  if (type === 'conversation') return (await prisma.conversation.findUnique({ where: { id }, select: { createdById: true } }))?.createdById ?? null;
  if (type === 'user') return id;
  return null;
}

async function removeContent(req, type, id) {
  if (type === 'post') {
    const p = await prisma.post.update({ where: { id }, data: { removedAt: new Date(), removedById: req.user.id } });
    return p.authorId;
  }
  if (type === 'comment') {
    const c = await prisma.comment.update({ where: { id }, data: { removedById: req.user.id } });
    return c.authorId;
  }
  if (type === 'message') {
    const m = await prisma.message.update({ where: { id }, data: { removedById: req.user.id, pinnedAt: null }, include: { conversation: true } });
    await publish((await conversationChannels(m.conversation)).map((channel) => ({ channel, type: 'message_removed', payload: { conversationId: m.conversationId, messageId: m.id } })));
    return m.authorId;
  }
  if (type === 'conversation') {
    const c = await prisma.conversation.update({ where: { id }, data: { archivedAt: new Date() } });
    return c.createdById;
  }
  throw Object.assign(new Error('This item can’t be changed from here.'), { status: 400, expose: true });
}

async function restoreContent(type, id) {
  if (type === 'post') return prisma.post.update({ where: { id }, data: { removedAt: null, removedById: null } });
  if (type === 'comment') return prisma.comment.update({ where: { id }, data: { removedById: null } });
  if (type === 'message') return prisma.message.update({ where: { id }, data: { removedById: null } });
  if (type === 'conversation') return prisma.conversation.update({ where: { id }, data: { archivedAt: null } });
  throw Object.assign(new Error('This item can’t be changed from here.'), { status: 400, expose: true });
}

// How a closed report reads in the moderation queue.
const RESOLUTION = { remove: 'Removed', restore: 'Restored', mute: 'Posting paused', unmute: 'Posting pause ended', suspend: 'Account suspended', ban: 'Account banned', dismiss: 'Dismissed' };

// One endpoint for every moderation action, logged in ModerationAction and
// the audit log. Actions: remove, restore, mute, unmute, suspend, ban, dismiss.
adminCommunityRouter.post('/actions', asyncHandler(async (req, res) => {
  const action = String(req.body?.action ?? '');
  const reason = str(req.body?.reason, 500) || null;
  const report = req.body?.reportId ? await prisma.report.findUnique({ where: { id: String(req.body.reportId) } }) : null;
  const targetType = String(req.body?.targetType ?? report?.targetType ?? '');
  const targetId = String(req.body?.targetId ?? report?.targetId ?? '');
  let targetUserId = req.body?.userId ? String(req.body.userId) : report?.targetUserId ?? null;

  // Moderators can't pause, remove or restore content of fellow staff.
  if (['remove', 'restore', 'mute', 'unmute'].includes(action)) {
    const owner = targetUserId ?? (await contentOwner(targetType, targetId));
    if (!(await outranks(req.user, owner))) return res.status(403).json({ error: 'You can’t moderate an account with the same or a higher role.' });
  }

  switch (action) {
    case 'remove':
      targetUserId = (await removeContent(req, targetType, targetId)) ?? targetUserId;
      if (targetUserId) await notify([{ userId: targetUserId, type: 'moderation', title: 'A moderator removed something you posted', body: reason ?? 'It broke the Community Guidelines.', link: '/app/community/guidelines' }]);
      break;
    case 'restore':
      await restoreContent(targetType, targetId);
      break;
    case 'mute':
    case 'unmute': {
      if (!targetUserId) return res.status(400).json({ error: 'Choose a trader.' });
      const hours = Math.min(Math.max(parseInt(req.body?.hours, 10) || 24, 1), 24 * 90);
      await prisma.user.update({ where: { id: targetUserId }, data: { communityMutedUntil: action === 'mute' ? new Date(Date.now() + hours * 3600e3) : null } });
      if (action === 'mute') await notify([{ userId: targetUserId, type: 'moderation', title: `Your Community posting is paused for ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}`, body: reason ?? 'A moderator reviewed your recent activity.', link: '/app/community/guidelines' }]);
      break;
    }
    case 'suspend':
    case 'ban':
    case 'reinstate': {
      if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only admins can suspend or ban accounts.' });
      if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: 'Choose another trader.' });
      const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
      if (['admin', 'super_admin'].includes(target?.role) && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Only a super admin can act on other admin accounts.' });
      await prisma.user.update({ where: { id: targetUserId }, data: { status: action === 'reinstate' ? 'active' : action === 'ban' ? 'banned' : 'suspended' } });
      if (action !== 'reinstate') await revokeUserSessions(targetUserId);
      forgetUserAccess(targetUserId);
      break;
    }
    case 'dismiss':
      if (!report) return res.status(400).json({ error: 'There’s no open report to dismiss.' });
      break;
    default:
      return res.status(400).json({ error: 'That action isn’t available here.' });
  }

  await prisma.moderationAction.create({ data: { moderatorId: req.user.id, action, targetType: targetType || 'user', targetId: targetId || targetUserId || '', targetUserId, reportId: report?.id ?? null, reason } });
  if (report) {
    // Resolve every open report about the same item together.
    await prisma.report.updateMany({ where: { status: 'open', targetType: report.targetType, targetId: report.targetId }, data: { status: action === 'dismiss' ? 'dismissed' : 'actioned', resolvedById: req.user.id, resolvedAt: new Date(), resolution: `${RESOLUTION[action] ?? action}${reason ? `: ${reason}` : ''}` } });
  }
  await audit(req, `community.${action}`, { targetType: targetType || 'user', targetId: targetId || targetUserId, detail: { reason, reportId: report?.id } });
  res.json({ ok: true });
}));

adminCommunityRouter.get('/log', asyncHandler(async (req, res) => {
  const rows = await prisma.moderationAction.findMany({ orderBy: { createdAt: 'desc' }, take: 150 });
  const cards = await userCards(rows.flatMap((r) => [r.moderatorId, r.targetUserId]));
  res.json({ actions: rows.map((r) => ({ ...r, moderator: r.moderatorId ? cards.get(r.moderatorId) : null, targetUser: r.targetUserId ? cards.get(r.targetUserId) : null })) });
}));

// ── rooms & communities ────────────────────────────────────────────────────
adminCommunityRouter.get('/rooms', asyncHandler(async (req, res) => {
  const rows = await prisma.conversation.findMany({ where: { kind: { in: ['room', 'community', 'event'] } }, orderBy: [{ kind: 'asc' }, { lastMessageAt: 'desc' }], take: 300 });
  const counts = await prisma.conversationMember.groupBy({ by: ['conversationId'], where: { conversationId: { in: rows.map((r) => r.id) }, status: 'active' }, _count: { _all: true } });
  const countBy = new Map(counts.map((c) => [c.conversationId, c._count._all]));
  res.json({ rooms: rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, description: r.description, instrument: r.instrument, visibility: r.visibility, sendPolicy: r.sendPolicy, featured: r.featured, archived: !!r.archivedAt, messageCount: r.messageCount, lastMessageAt: r.lastMessageAt, members: countBy.get(r.id) ?? 0 })) });
}));

// Official communities created by staff (e.g. "London Session Traders").
adminCommunityRouter.post('/rooms', asyncHandler(async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only admins can create communities.' });
  const name = str(req.body?.name, 60);
  if (name.length < 3) return res.status(400).json({ error: 'Name must be at least 3 characters.' });
  const visibility = ['public', 'private', 'invite_only'].includes(req.body?.visibility) ? req.body.visibility : 'public';
  const conv = await prisma.conversation.create({
    data: { kind: 'community', visibility, joinPolicy: { public: 'open', private: 'approval', invite_only: 'invite' }[visibility], name, description: str(req.body?.description, 300) || null, sendPolicy: req.body?.sendPolicy === 'admins' ? 'admins' : 'everyone', featured: !!req.body?.featured, createdById: req.user.id, members: { create: { userId: req.user.id, role: 'owner' } } },
  });
  await audit(req, 'community.room_created', { targetType: 'conversation', targetId: conv.id, detail: { name, visibility } });
  res.status(201).json({ id: conv.id });
}));

adminCommunityRouter.patch('/rooms/:id', asyncHandler(async (req, res) => {
  const data = {};
  if (typeof req.body?.featured === 'boolean') data.featured = req.body.featured;
  if (typeof req.body?.archived === 'boolean') data.archivedAt = req.body.archived ? new Date() : null;
  if (['everyone', 'admins'].includes(req.body?.sendPolicy)) data.sendPolicy = req.body.sendPolicy;
  if (req.body?.description !== undefined) data.description = str(req.body.description, 300) || null;
  if (req.body?.name !== undefined && str(req.body.name, 60).length >= 3) data.name = str(req.body.name, 60);
  const conv = await prisma.conversation.update({ where: { id: req.params.id }, data });
  await audit(req, 'community.room_updated', { targetType: 'conversation', targetId: conv.id, detail: data });
  res.json({ ok: true });
}));

// ── events ─────────────────────────────────────────────────────────────────
adminCommunityRouter.get('/events', asyncHandler(async (req, res) => {
  const rows = await prisma.marketEvent.findMany({ where: { scheduledAt: { gte: new Date(Date.now() - 14 * DAY) } }, orderBy: { scheduledAt: 'asc' }, take: 200 });
  res.json({ events: rows.map((e) => ({ ...eventView(e), source: e.source, cancelled: e.cancelled })) });
}));

adminCommunityRouter.post('/events', asyncHandler(async (req, res) => {
  const title = str(req.body?.title, 160);
  const currency = str(req.body?.currency, 3).toUpperCase();
  const at = new Date(req.body?.scheduledAt);
  if (!title || !/^[A-Z]{3}$/.test(currency) || Number.isNaN(at.getTime())) return res.status(400).json({ error: 'Add a title, a currency and a date and time.' });
  const e = await prisma.marketEvent.create({
    data: { sourceKey: `admin:${Date.now()}:${title}`.slice(0, 250), source: 'admin', title, currency, country: str(req.body?.country, 60) || currency, category: str(req.body?.category, 40) || 'other', importance: ['High', 'Medium', 'Low'].includes(req.body?.importance) ? req.body.importance : 'Medium', scheduledAt: at, dateOnly: !!req.body?.dateOnly, sourceName: str(req.body?.sourceName, 120) || null, sourceUrl: /^https:\/\//.test(req.body?.sourceUrl ?? '') ? req.body.sourceUrl : null, instruments: instrumentsForCurrency(currency), createdById: req.user.id },
  });
  await audit(req, 'community.event_created', { targetType: 'event', targetId: e.id, detail: { title } });
  res.status(201).json({ event: eventView(e) });
}));

// Previous / forecast / actual need a named source; nothing is inferred.
adminCommunityRouter.patch('/events/:id', asyncHandler(async (req, res) => {
  const data = {};
  for (const k of ['previous', 'forecast', 'actual']) if (req.body?.[k] !== undefined) data[k] = str(req.body[k], 40) || null;
  if (req.body?.valuesNote !== undefined) data.valuesNote = str(req.body.valuesNote, 200) || null;
  if (['High', 'Medium', 'Low'].includes(req.body?.importance)) data.importance = req.body.importance;
  if (typeof req.body?.cancelled === 'boolean') data.cancelled = req.body.cancelled;
  if ((data.previous || data.forecast || data.actual) && !(data.valuesNote ?? (await prisma.marketEvent.findUnique({ where: { id: req.params.id }, select: { valuesNote: true } }))?.valuesNote)) {
    return res.status(400).json({ error: 'Say where the figures come from (for example "BLS release, 8:30 ET").' });
  }
  const e = await prisma.marketEvent.update({ where: { id: req.params.id }, data });
  await audit(req, 'community.event_updated', { targetType: 'event', targetId: e.id, detail: data });
  res.json({ event: eventView(e) });
}));

// ── featured content ───────────────────────────────────────────────────────
adminCommunityRouter.get('/content', asyncHandler(async (req, res) => {
  const [featured, top] = await Promise.all([
    prisma.post.findMany({ where: { featuredAt: { not: null }, deletedAt: null, removedAt: null }, orderBy: { featuredAt: 'desc' }, take: 30, include: { idea: true } }),
    prisma.post.findMany({ where: { deletedAt: null, removedAt: null, createdAt: { gte: new Date(Date.now() - 7 * DAY) } }, orderBy: [{ commentCount: 'desc' }, { reactionCount: 'desc' }], take: 30, include: { idea: true } }),
  ]);
  const cards = await userCards([...featured, ...top].map((p) => p.authorId));
  const view = (p) => ({ id: p.id, kind: p.kind, body: p.body.slice(0, 280), instrument: p.instrument, idea: p.idea ? { direction: p.idea.direction, status: p.idea.status } : null, author: cards.get(p.authorId), commentCount: p.commentCount, reactionCount: p.reactionCount, featured: !!p.featuredAt, createdAt: p.createdAt });
  res.json({ featured: featured.map(view), topThisWeek: top.map(view) });
}));

adminCommunityRouter.post('/posts/:id/feature', asyncHandler(async (req, res) => {
  const p = await prisma.post.update({ where: { id: req.params.id }, data: { featuredAt: req.body?.featured === false ? null : new Date() } });
  await audit(req, req.body?.featured === false ? 'community.post_unfeatured' : 'community.post_featured', { targetType: 'post', targetId: p.id });
  res.json({ featured: !!p.featuredAt });
}));

// Community-level user lookup for moderators.
adminCommunityRouter.get('/users', asyncHandler(async (req, res) => {
  const q = str(req.query.q, 60);
  const users = await prisma.user.findMany({
    where: { username: { not: null }, ...(q ? { OR: [{ username: { contains: q.toLowerCase() } }, { name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) },
    select: { ...USER_CARD_SELECT, email: true, communityMutedUntil: true, createdAt: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
  });
  const reports = await prisma.report.groupBy({ by: ['targetUserId'], where: { targetUserId: { in: users.map((u) => u.id) } }, _count: { _all: true } });
  const rBy = new Map(reports.map((r) => [r.targetUserId, r._count._all]));
  res.json({ users: users.map((u) => ({ ...userCard(u), email: isAdmin(req.user) ? u.email : null, accountStatus: u.status, mutedUntil: u.communityMutedUntil, reports: rBy.get(u.id) ?? 0, joined: u.createdAt })) });
}));
