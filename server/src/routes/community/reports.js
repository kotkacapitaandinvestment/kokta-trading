import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { auditLater } from '../../lib/audit.js';
import { overLimit } from '../../lib/community/throttle.js';
import { str } from './context.js';
import { conversationAccess } from '../../lib/community/access.js';

export const reportsRouter = Router();

export const REPORT_CATEGORIES = ['spam', 'scam', 'harassment', 'hate', 'impersonation', 'fraud', 'manipulation', 'illegal', 'other'];

// Only things the reporter can actually see can be reported.
async function resolveTarget(type, id, me) {
  switch (type) {
    case 'post': return prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true } }).then((r) => r && { userId: r.authorId });
    case 'comment': return prisma.comment.findUnique({ where: { id }, select: { authorId: true } }).then((r) => r && { userId: r.authorId });
    case 'message': {
      const m = await prisma.message.findUnique({ where: { id }, select: { authorId: true, conversation: true } });
      return m && (await conversationAccess(m.conversation, me)).canRead ? { userId: m.authorId } : null;
    }
    case 'user': return prisma.user.findUnique({ where: { id }, select: { id: true } }).then((r) => r && { userId: r.id });
    case 'conversation': {
      const c = await prisma.conversation.findUnique({ where: { id } });
      const listed = c?.kind === 'community' && ['public', 'private'].includes(c.visibility);
      return c && (listed || (await conversationAccess(c, me)).canRead) ? { userId: c.createdById } : null;
    }
    default: return null;
  }
}

reportsRouter.post('/reports', asyncHandler(async (req, res) => {
  const targetType = String(req.body?.targetType ?? '');
  const targetId = String(req.body?.targetId ?? '');
  const category = String(req.body?.category ?? '');
  if (!REPORT_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose what’s wrong with it.' });
  const target = await resolveTarget(targetType, targetId, req.me);
  if (!target) return res.status(404).json({ error: 'We couldn’t find that. It may already have been removed.' });
  if (target.userId === req.me.id) return res.status(400).json({ error: "You can't report yourself." });
  const limited = await overLimit('report', req.me.id);
  if (limited) return res.status(429).json({ error: 'Thanks for all your reports today. Our moderators are working through them, so please try again tomorrow.' });
  const existing = await prisma.report.findFirst({ where: { reporterId: req.me.id, targetType, targetId, status: 'open' } });
  const details = str(req.body?.details, 1000) || null;
  if (existing) await prisma.report.update({ where: { id: existing.id }, data: { category, details: details ?? existing.details } });
  else await prisma.report.create({ data: { reporterId: req.me.id, targetType, targetId, targetUserId: target.userId ?? null, category, details } });
  auditLater(req, 'community.reported', { targetType, targetId, actor: req.me, detail: { category, reportedUserId: target.userId ?? undefined } });
  res.status(201).json({ ok: true, message: target.userId ? 'Thanks. A moderator will review it. You can also block this trader from their profile.' : 'Thanks. A moderator will review it.' });
}));
